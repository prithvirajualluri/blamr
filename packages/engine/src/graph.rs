use std::collections::{HashMap, HashSet, VecDeque};

#[derive(Debug, Clone)]
pub struct GraphEdge {
    pub from: String,
    pub to: String,
    pub influence: f64,
    pub confidence_in: f64,
    pub confidence_out: f64,
}

#[derive(Debug, Clone)]
pub struct CausalGraph {
    pub agents: Vec<String>,
    pub edges: Vec<GraphEdge>,
    pub adjacency: HashMap<String, Vec<(String, f64)>>,
    pub reverse_adjacency: HashMap<String, Vec<(String, f64)>>,
    pub terminal: String,
}

pub fn build_graph(agents: &[String], edges: &[GraphEdge]) -> CausalGraph {
    let mut adjacency: HashMap<String, Vec<(String, f64)>> = HashMap::new();
    let mut reverse_adjacency: HashMap<String, Vec<(String, f64)>> = HashMap::new();
    let mut has_outgoing: HashSet<String> = HashSet::new();
    let mut has_incoming: HashSet<String> = HashSet::new();

    for agent in agents {
        adjacency.entry(agent.clone()).or_default();
        reverse_adjacency.entry(agent.clone()).or_default();
    }

    for edge in edges {
        adjacency
            .entry(edge.from.clone())
            .or_default()
            .push((edge.to.clone(), edge.influence));
        reverse_adjacency
            .entry(edge.to.clone())
            .or_default()
            .push((edge.from.clone(), edge.influence));
        has_outgoing.insert(edge.from.clone());
        has_incoming.insert(edge.to.clone());
    }

    let terminal = agents
        .iter()
        .rev()
        .find(|a| has_incoming.contains(*a))
        .or_else(|| agents.last())
        .cloned()
        .unwrap_or_default();

    CausalGraph {
        agents: agents.to_vec(),
        edges: edges.to_vec(),
        adjacency,
        reverse_adjacency,
        terminal,
    }
}

pub fn backward_bfs(graph: &CausalGraph) -> HashMap<String, f64> {
    let mut scores: HashMap<String, f64> = HashMap::new();
    let mut queue: VecDeque<String> = VecDeque::new();

    scores.insert(graph.terminal.clone(), 1.0);
    queue.push_back(graph.terminal.clone());

    while let Some(node) = queue.pop_front() {
        let current_score = *scores.get(&node).unwrap_or(&0.0);

        if let Some(predecessors) = graph.reverse_adjacency.get(&node) {
            for (pred, weight) in predecessors {
                let contribution = current_score * weight;
                let entry = scores.entry(pred.clone()).or_insert(0.0);
                *entry += contribution;

                if !queue.contains(pred) {
                    queue.push_back(pred.clone());
                }
            }
        }
    }

    scores
}
