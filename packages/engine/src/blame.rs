use std::collections::HashMap;

use crate::graph::{build_graph, backward_bfs, GraphEdge, CausalGraph};
use crate::shapley::compute_shapley;

pub mod pb {
    tonic::include_proto!("blamr");
}

use pb::{AgentBlame, BlameReport, CausalEdge, WorkflowRun};

pub fn compute_blame(run: &WorkflowRun) -> BlameReport {
    let agents = run.agents.clone();
    let graph_edges: Vec<GraphEdge> = run
        .edges
        .iter()
        .map(|e| GraphEdge {
            from: e.from_agent.clone(),
            to: e.to_agent.clone(),
            influence: e.influence_score,
            confidence_in: e.confidence_in,
            confidence_out: e.confidence_out,
        })
        .collect();

    let graph = build_graph(&agents, &graph_edges);
    let bfs_scores = backward_bfs(&graph);

    let is_success = run.status == "success";
    let shapley_scores = if is_success && run.error_summary.is_empty() {
        compute_success_blame(&graph, &run.id, &bfs_scores)
    } else {
        compute_shapley(&graph, &run.id, &bfs_scores)
    };

    let confidence_deltas = compute_confidence_deltas(&graph);
    let root_cause = identify_root_cause(&shapley_scores, &confidence_deltas, is_success);

    let agent_blames: Vec<AgentBlame> = agents
        .iter()
        .map(|agent| {
            let blame_pct = *shapley_scores.get(agent).unwrap_or(&0.0);
            let conf_delta = confidence_deltas.get(agent).copied().unwrap_or(0.0);
            let inflated = conf_delta > 0.15;
            let is_root = agent == &root_cause.0;

            AgentBlame {
                agent: agent.clone(),
                blame_pct,
                is_root,
                reason: generate_reason(agent, blame_pct, inflated, conf_delta, is_success, is_root),
                confidence_inflated: inflated,
            }
        })
        .collect();

    let mut sorted = agent_blames.clone();
    sorted.sort_by(|a, b| b.blame_pct.partial_cmp(&a.blame_pct).unwrap());

    BlameReport {
        run_id: run.id.clone(),
        root_cause_agent: root_cause.0,
        root_cause_pct: root_cause.1,
        method: "backward_bfs_shapley".to_string(),
        computed_at_ms: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64,
        agents: sorted,
    }
}

fn compute_success_blame(
    graph: &CausalGraph,
    run_id: &str,
    bfs_scores: &HashMap<String, f64>,
) -> HashMap<String, f64> {
    compute_shapley(graph, run_id, bfs_scores)
}

fn compute_confidence_deltas(graph: &CausalGraph) -> HashMap<String, f64> {
    let mut deltas: HashMap<String, f64> = HashMap::new();
    for edge in &graph.edges {
        let delta = edge.confidence_out - edge.confidence_in;
        let entry = deltas.entry(edge.from.clone()).or_insert(0.0);
        if delta > *entry {
            *entry = delta;
        }
    }
    deltas
}

fn identify_root_cause(
    shapley: &HashMap<String, f64>,
    confidence_deltas: &HashMap<String, f64>,
    is_success: bool,
) -> (String, f64) {
    if shapley.is_empty() {
        return (String::new(), 0.0);
    }

    let max_blame = shapley.values().cloned().fold(0.0_f64, f64::max);

    if is_success && max_blame < 1.0 {
        return (String::new(), 0.0);
    }

    let mut best_agent = String::new();
    let mut best_score = -1.0_f64;
    let mut best_blame = 0.0_f64;

    for (agent, &blame) in shapley {
        let conf_delta = confidence_deltas.get(agent).copied().unwrap_or(0.0);
        let combined = blame + conf_delta * 100.0;
        if combined > best_score {
            best_score = combined;
            best_agent = agent.clone();
            best_blame = blame;
        }
    }

    (best_agent, best_blame)
}

fn generate_reason(
    agent: &str,
    blame_pct: f64,
    inflated: bool,
    conf_delta: f64,
    is_success: bool,
    is_root: bool,
) -> String {
    if is_success && blame_pct < 1.0 {
        return "All agents healthy — no blame attributed.".to_string();
    }

    if is_root {
        if inflated {
            return format!(
                "{} is root cause ({:.0}% blame). Confidence inflated by {:.2} — high certainty on degraded output.",
                agent, blame_pct, conf_delta
            );
        }
        return format!(
            "{} is root cause ({:.0}% blame). Highest marginal contribution to failure via backward BFS + Shapley.",
            agent, blame_pct
        );
    }

    if blame_pct > 20.0 {
        return format!(
            "{} contributed {:.0}% blame — significant downstream impact.",
            agent, blame_pct
        );
    }

    format!(
        "{} contributed {:.0}% blame — minor role in failure chain.",
        agent, blame_pct
    )
}

pub fn edges_from_seed(edges: &[CausalEdge]) -> Vec<GraphEdge> {
    edges
        .iter()
        .map(|e| GraphEdge {
            from: e.from_agent.clone(),
            to: e.to_agent.clone(),
            influence: e.influence_score,
            confidence_in: e.confidence_in,
            confidence_out: e.confidence_out,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::pb::{CausalEdge, WorkflowRun};
    use super::compute_blame;

    fn make_run(
        id: &str,
        status: &str,
        agents: Vec<&str>,
        edges: Vec<(&str, &str, f64, f64, f64)>,
    ) -> WorkflowRun {
        let edge_list: Vec<CausalEdge> = edges
            .iter()
            .enumerate()
            .map(|(i, (from, to, influence, ci, co))| CausalEdge {
                id: format!("{}_edge_{}", id, i),
                run_id: id.to_string(),
                workflow_id: "test".to_string(),
                workspace_id: "ws_default".to_string(),
                from_agent: from.to_string(),
                to_agent: to.to_string(),
                hop_index: i as i32,
                timestamp_ms: 1000 + i as i64 * 100,
                confidence_in: *ci,
                confidence_out: *co,
                intent_delta: 0.0,
                influence_score: *influence,
                tokens_in: 100,
                tokens_out: 50,
                latency_ms: 100,
                model: "test".to_string(),
                call_type: "LLM call".to_string(),
                cost_usd: 0.001,
            })
            .collect();

        WorkflowRun {
            id: id.to_string(),
            workflow_id: "test".to_string(),
            workspace_id: "ws_default".to_string(),
            status: status.to_string(),
            agents: agents.into_iter().map(String::from).collect(),
            edges: edge_list,
            accuracy_score: 0.5,
            error_summary: if status == "failed" {
                "test error".to_string()
            } else {
                String::new()
            },
        }
    }

    #[test]
    fn test_run_a1b2c3_intent_classifier_root() {
        let run = make_run(
            "run_a1b2c3",
            "failed",
            vec!["intent_classifier", "policy_lookup", "response_writer"],
            vec![
                ("intent_classifier", "policy_lookup", 0.89, 0.91, 0.91),
                ("policy_lookup", "response_writer", 0.44, 0.88, 0.86),
            ],
        );
        let report = compute_blame(&run);
        assert_eq!(report.root_cause_agent, "intent_classifier");
        assert!(report.root_cause_pct > 50.0);
    }

    #[test]
    fn test_success_run_no_root() {
        let mut run = make_run(
            "run_f6g7h8",
            "success",
            vec!["employee_intake", "document_generator"],
            vec![("employee_intake", "document_generator", 0.82, 0.91, 0.90)],
        );
        run.error_summary = String::new();
        let report = compute_blame(&run);
        assert!(report.root_cause_agent.is_empty() || report.root_cause_pct < 1.0);
    }
}
