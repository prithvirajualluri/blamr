use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use std::collections::{HashMap, HashSet};

use crate::graph::CausalGraph;

const MC_ITERATIONS: usize = 1000;

pub fn compute_shapley(
    graph: &CausalGraph,
    run_id: &str,
    bfs_scores: &HashMap<String, f64>,
) -> HashMap<String, f64> {
    let agents = &graph.agents;
    if agents.is_empty() {
        return HashMap::new();
    }

    let n = agents.len();
    if n == 1 {
        let mut result = HashMap::new();
        result.insert(agents[0].clone(), 100.0);
        return result;
    }

    let seed = hash_run_id(run_id);
    let mut rng = ChaCha8Rng::seed_from_u64(seed);

    let mut shapley_sums: HashMap<String, f64> = HashMap::new();
    for agent in agents {
        shapley_sums.insert(agent.clone(), 0.0);
    }

    let total_bfs: f64 = bfs_scores.values().sum();

    for _ in 0..MC_ITERATIONS {
        let mut perm: Vec<usize> = (0..n).collect();
        shuffle(&mut perm, &mut rng);

        let mut coalition: HashSet<usize> = HashSet::new();
        let mut prev_value = 0.0;

        for &idx in &perm {
            coalition.insert(idx);
            let value = coalition_value(&coalition, agents, bfs_scores, total_bfs, graph);
            let marginal = (value - prev_value).max(0.0);
            *shapley_sums.get_mut(&agents[idx]).unwrap() += marginal;
            prev_value = value;
        }
    }

    let total: f64 = shapley_sums.values().sum();
    if total <= 0.0 {
        return fallback_proportional(agents, bfs_scores);
    }

    shapley_sums
        .into_iter()
        .map(|(agent, score)| (agent, (score / total) * 100.0))
        .collect()
}

fn coalition_value(
    coalition: &HashSet<usize>,
    agents: &[String],
    bfs_scores: &HashMap<String, f64>,
    total_bfs: f64,
    graph: &CausalGraph,
) -> f64 {
    if coalition.is_empty() {
        return 0.0;
    }

    let coalition_agents: HashSet<&str> = coalition.iter().map(|&i| agents[i].as_str()).collect();

    let mut value = 0.0;
    for edge in &graph.edges {
        if coalition_agents.contains(edge.from.as_str()) && coalition_agents.contains(edge.to.as_str())
        {
            value += edge.influence;
        } else if coalition_agents.contains(edge.from.as_str()) {
            value += edge.influence * 0.5;
        }
    }

    for idx in coalition {
        if let Some(&score) = bfs_scores.get(&agents[*idx]) {
            value += score / total_bfs.max(1.0);
        }
    }

    value
}

fn fallback_proportional(
    agents: &[String],
    bfs_scores: &HashMap<String, f64>,
) -> HashMap<String, f64> {
    let total: f64 = bfs_scores.values().sum();
    if total <= 0.0 {
        let equal = 100.0 / agents.len() as f64;
        return agents.iter().map(|a| (a.clone(), equal)).collect();
    }
    bfs_scores
        .iter()
        .map(|(a, s)| (a.clone(), (s / total) * 100.0))
        .collect()
}

fn hash_run_id(run_id: &str) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    run_id.hash(&mut hasher);
    hasher.finish()
}

fn shuffle(arr: &mut [usize], rng: &mut ChaCha8Rng) {
    use rand::Rng;
    for i in (1..arr.len()).rev() {
        let j = rng.gen_range(0..=i);
        arr.swap(i, j);
    }
}
