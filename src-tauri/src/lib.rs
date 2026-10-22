mod calculator;

use calculator::{CalculateRequest, CalculationResult, ConvertRequest};

#[tauri::command]
fn calculate(request: CalculateRequest) -> Result<CalculationResult, String> {
    calculator::calculate(request)
}

#[tauri::command]
fn convert_base(request: ConvertRequest) -> Result<CalculationResult, String> {
    calculator::convert_base(request)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![calculate, convert_base])
        .run(tauri::generate_context!())
        .expect("无法启动计算器");
}
