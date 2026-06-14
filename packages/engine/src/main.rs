use tonic::{transport::Server, Request, Response, Status};

use blamr_engine::blame::pb::blame_engine_server::{BlameEngine, BlameEngineServer};
use blamr_engine::blame::pb::{
    ComputeBlameRequest, ComputeBlameResponse, HealthRequest, HealthResponse,
};
use blamr_engine::compute_blame;

#[derive(Default)]
pub struct BlameEngineService;

#[tonic::async_trait]
impl BlameEngine for BlameEngineService {
    async fn compute_blame(
        &self,
        request: Request<ComputeBlameRequest>,
    ) -> Result<Response<ComputeBlameResponse>, Status> {
        let req = request.into_inner();
        let run = req
            .run
            .ok_or_else(|| Status::invalid_argument("run is required"))?;

        let report = compute_blame(&run);

        Ok(Response::new(ComputeBlameResponse {
            report: Some(report),
        }))
    }

    async fn health(
        &self,
        _request: Request<HealthRequest>,
    ) -> Result<Response<HealthResponse>, Status> {
        Ok(Response::new(HealthResponse {
            status: "ok".to_string(),
        }))
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let addr = std::env::var("BLAME_ENGINE_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:50051".to_string())
        .parse()?;

    println!("blamr blame engine listening on {}", addr);

    Server::builder()
        .add_service(BlameEngineServer::new(BlameEngineService::default()))
        .serve(addr)
        .await?;

    Ok(())
}
