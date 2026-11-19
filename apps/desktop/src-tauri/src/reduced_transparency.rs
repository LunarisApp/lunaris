#[tauri::command]
pub fn desktop_reduce_transparency() -> bool {
    #[cfg(target_os = "macos")]
    {
        objc2_app_kit::NSWorkspace::sharedWorkspace().accessibilityDisplayShouldReduceTransparency()
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

#[cfg(target_os = "macos")]
pub fn observe(app: tauri::AppHandle) {
    use block2::RcBlock;
    use objc2_app_kit::{NSWorkspace, NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification};
    use objc2_foundation::NSOperationQueue;
    use tauri::Emitter;

    let callback = RcBlock::new(move |_| {
        let _ = app.emit(
            "lunaris-reduce-transparency-changed",
            desktop_reduce_transparency(),
        );
    });
    // The workspace notification center retains the observer for the app lifetime.
    // The callback captures only the thread-safe app handle and runs on the main queue.
    unsafe {
        NSWorkspace::sharedWorkspace()
            .notificationCenter()
            .addObserverForName_object_queue_usingBlock(
                Some(NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification),
                None,
                Some(&NSOperationQueue::mainQueue()),
                &callback,
            );
    }
}
