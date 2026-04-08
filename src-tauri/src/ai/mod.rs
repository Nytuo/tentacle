pub mod ollama;

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiResponse {
    pub text: String,
    pub model: String,
    pub done: bool,
}
