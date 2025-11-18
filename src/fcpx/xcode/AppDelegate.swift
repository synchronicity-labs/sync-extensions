//
//  AppDelegate.swift
//  sync-fcpx-app
//
//  Container app for FCPX workflow extension
//  This app must be installed in /Applications and launched once to register the extension
//

import Cocoa

@main
class AppDelegate: NSObject, NSApplicationDelegate {
    
    func applicationDidFinishLaunching(_ aNotification: Notification) {
        // This app exists only to contain the workflow extension
        // The extension is what actually runs in Final Cut Pro
        // You can close this app after launching it once to register the extension
        
        print("sync. FCPX Extension container app launched")
        print("Extension should now be registered with macOS")
        print("Open Final Cut Pro and check Window > Extensions")
        
        // Optionally show a notification or window
        // For now, we'll just register and exit
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            NSApplication.shared.terminate(nil)
        }
    }
    
    func applicationWillTerminate(_ aNotification: Notification) {
        // Cleanup if needed
    }
    
    func applicationSupportsSecureRestorableState(_ app: NSApplication) -> Bool {
        return true
    }
}

