#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    match lunaris_desktop_lib::desktop_mcp::parse_invocation(std::env::args().skip(1)) {
        Ok(Some(access)) => {
            let runtime = tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .expect("failed to create MCP runtime");
            if let Err(error) = runtime.block_on(lunaris_desktop_lib::desktop_mcp::serve(access)) {
                eprintln!("Lunaris MCP failed: {error}");
                std::process::exit(1);
            }
            return;
        }
        Ok(None) => {}
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(2);
        }
    }
    lunaris_desktop_lib::run();
}
