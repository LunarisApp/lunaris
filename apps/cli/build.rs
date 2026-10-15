use std::env;

fn main() {
    println!("cargo:rerun-if-env-changed=LUNARIS_BUILD_SHA");
    println!("cargo:rerun-if-env-changed=LUNARIS_SIGNING_MODE");

    let version = env::var("CARGO_PKG_VERSION").expect("Cargo package version is set");
    let sha = env::var("LUNARIS_BUILD_SHA").unwrap_or_else(|_| "local".into());
    let short_sha = sha.get(..7).unwrap_or(&sha);
    let signing_mode = env::var("LUNARIS_SIGNING_MODE").unwrap_or_else(|_| "local".into());

    println!("cargo:rustc-env=LUNARIS_BUILD_VERSION={version} ({short_sha}, {signing_mode})");
}
