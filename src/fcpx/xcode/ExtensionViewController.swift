//
//  ExtensionViewController.swift
//  sync-fcpx-extension
//
//  Final Cut Pro Workflow Extension
//  Principal view controller that loads our web UI
//

import Cocoa
import WebKit

// Import FinalCutPro framework from Workflow Extension SDK
// In Xcode: Add FinalCutPro.framework to "Link Binary With Libraries"
// Framework is provided by the Workflow Extension SDK
// Uncomment when framework is linked:
// import FinalCutPro

// Protocol definitions - these will be provided by the SDK framework
// For now, we use AnyObject as placeholders
// Replace with actual SDK types when framework is linked:
typealias FCPXHost = AnyObject
typealias FCPXTimelineObserver = AnyObject  
typealias FCPXProject = AnyObject
typealias FCPXTimeline = AnyObject
typealias FCPXTimecode = AnyObject

// Get FCPX host singleton - function provided by SDK
// Check SDK headers for exact signature
@_silgen_name("ProExtensionHostSingleton")
func ProExtensionHostSingleton() -> AnyObject? {
    // This function is provided by FinalCutPro.framework
    // Will be resolved when framework is linked
    return nil
}

class ExtensionViewController: NSViewController {
    
    @IBOutlet weak var webView: WKWebView!
    
    var fcpxHost: FCPXHost?
    var timelineObserver: FCPXTimelineObserver?
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        // Start HTTP backend server (bridges to our Node.js implementation)
        HTTPBridge.shared.startBackendServer()
        
        // Configure WebView first
        setupWebView()
        
        // Get FCPX host singleton (if available)
        // Note: This may not be available immediately - check SDK docs
        if let hostSingleton = ProExtensionHostSingleton() {
            self.fcpxHost = hostSingleton as? FCPXHost
            if fcpxHost != nil {
                setupTimelineObserver()
            }
        }
        
        // Load our UI
        loadWebUI()
        
        // Inject JavaScript bridge after a short delay to ensure WebView is ready
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            self.injectJavaScriptBridge()
        }
    }
    
    override func viewWillAppear() {
        super.viewWillAppear()
        
        // Sync with FCPX timeline when view appears
        syncWithTimeline()
    }
    
    override func viewWillDisappear() {
        super.viewWillDisappear()
        
        // Clean up observers
        if let observer = timelineObserver {
            fcpxHost?.removeTimelineObserver?(observer)
        }
        
        // Stop HTTP server when extension closes
        HTTPBridge.shared.stopBackendServer()
    }
    
    // MARK: - Setup
    
    private func setupWebView() {
        let config = WKWebViewConfiguration()
        config.preferences.javaScriptEnabled = true
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        
        // Allow file access
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        
        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.navigationDelegate = self
        view.addSubview(webView)
    }
    
    private func loadWebUI() {
        // Try to load from bundle first
        if let bundlePath = Bundle.main.resourcePath {
            let staticPath = (bundlePath as NSString).appendingPathComponent("static")
            let htmlPath = (staticPath as NSString).appendingPathComponent("index.html")
            
            if FileManager.default.fileExists(atPath: htmlPath) {
                let htmlURL = URL(fileURLWithPath: htmlPath)
                let staticURL = URL(fileURLWithPath: staticPath)
                webView.loadFileURL(htmlURL, allowingReadAccessTo: staticURL)
                return
            }
        }
        
        // Fallback: load from dev server if available (for development)
        if let devURL = URL(string: "http://localhost:3001/main/") {
            webView.load(URLRequest(url: devURL))
        } else {
            // Last resort: show error message
            let errorHTML = """
            <html>
            <head><title>sync. Extension</title></head>
            <body>
                <h1>sync. Extension</h1>
                <p>UI files not found. Please ensure static files are included in the bundle.</p>
                <p>For development, start the dev server: <code>npm run dev</code></p>
            </body>
            </html>
            """
            webView.loadHTMLString(errorHTML, baseURL: nil)
        }
    }
    
    private func injectJavaScriptBridge() {
        // Inject FCPX API bridge
        let bridgeScript = """
        (function() {
            // Set host config
            window.HOST_CONFIG = {
                hostId: 'FCPX',
                hostName: 'Final Cut Pro',
                isAE: false
            };
            
            // Expose FCPX API if available
            if (window.webkit && window.webkit.messageHandlers) {
                window.fcpxAPI = {
                    getCurrentProject: function() {
                        return new Promise((resolve, reject) => {
                            window.webkit.messageHandlers.fcpx.postMessage({
                                action: 'getCurrentProject'
                            });
                            // Handle response via message handler
                        });
                    },
                    getCurrentTimeline: function() {
                        return new Promise((resolve, reject) => {
                            window.webkit.messageHandlers.fcpx.postMessage({
                                action: 'getCurrentTimeline'
                            });
                        });
                    }
                };
            }
            
            // Load host detection script
            const script1 = document.createElement('script');
            script1.src = 'host-detection.fcpx.js';
            document.head.appendChild(script1);
            
            // Load NLE adapter script
            const script2 = document.createElement('script');
            script2.src = 'nle-fcpx.js';
            document.head.appendChild(script2);
        })();
        """
        
        let userScript = WKUserScript(source: bridgeScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
        webView.configuration.userContentController.addUserScript(userScript)
        
        // Add message handler
        webView.configuration.userContentController.add(self, name: "fcpx")
    }
    
    private func setupTimelineObserver() {
        guard let host = fcpxHost else { return }
        
        // Create observer
        timelineObserver = TimelineObserver(controller: self)
        
        // Add observer - use optional chaining since methods may not exist
        if let observer = timelineObserver {
            // This will work when SDK is properly linked
            // For now, we'll handle it gracefully
            if host.responds(to: Selector(("addTimelineObserver:"))) {
                host.perform(Selector(("addTimelineObserver:")), with: observer)
            }
        }
    }
    
    private func syncWithTimeline() {
        guard let host = fcpxHost else { return }
        
        // Get timeline info - use dynamic method calls since types are placeholders
        // This will work properly when SDK is linked
        let script = """
        if (window.nle && window.nle.onTimelineChanged) {
            window.nle.onTimelineChanged({
                hasTimeline: true
            });
        }
        """
        webView.evaluateJavaScript(script, completionHandler: nil)
    }
}

// MARK: - WKNavigationDelegate

extension ExtensionViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Inject scripts after page loads
        injectJavaScriptBridge()
    }
}

// MARK: - WKScriptMessageHandler

extension ExtensionViewController: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "fcpx",
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }
        
        switch action {
        case "getCurrentProject":
            handleGetCurrentProject(message: message)
        case "getCurrentTimeline":
            handleGetCurrentTimeline(message: message)
        case "exportVideo":
            handleExportVideo(body: body, message: message)
        case "importFile":
            handleImportFile(body: body, message: message)
        default:
            break
        }
    }
    
    private func handleGetCurrentProject(message: WKScriptMessage) {
        guard let host = fcpxHost else {
            sendResponse(to: message, result: ["ok": false, "error": "FCPX host not available"])
            return
        }
        
        // Use dynamic method calls - will work when SDK is linked
        // For now, return error indicating HTTP API should be used
        sendResponse(to: message, result: ["ok": false, "error": "Use HTTP API endpoint /nle/getProjectDir"])
    }
    
    private func handleGetCurrentTimeline(message: WKScriptMessage) {
        guard let host = fcpxHost else {
            sendResponse(to: message, result: ["ok": false, "error": "FCPX host not available"])
            return
        }
        
        sendResponse(to: message, result: ["ok": false, "error": "Use HTTP API endpoint /nle/diagInOut"])
    }
    
    private func handleExportVideo(body: [String: Any], message: WKScriptMessage) {
        // Use HTTP API endpoint - bridges to our existing backend.ts
        sendResponse(to: message, result: ["ok": false, "error": "Use HTTP API endpoint /nle/exportInOutVideo"])
    }
    
    private func handleImportFile(body: [String: Any], message: WKScriptMessage) {
        // Use HTTP API endpoint
        sendResponse(to: message, result: ["ok": false, "error": "Use HTTP API endpoint /nle/importFileToBin"])
    }
    
    private func sendResponse(to message: WKScriptMessage, result: [String: Any]) {
        guard let jsonData = try? JSONSerialization.data(withJSONObject: result),
              let jsonString = String(data: jsonData, encoding: .utf8) else { return }
        
        let script = "window.fcpxAPI?.onMessage?.(\(jsonString));"
        webView.evaluateJavaScript(script, completionHandler: nil)
    }
}

// MARK: - Timeline Observer

class TimelineObserver: NSObject {
    weak var controller: ExtensionViewController?
    
    init(controller: ExtensionViewController) {
        self.controller = controller
        super.init()
    }
    
    // These methods will conform to FCPXTimelineObserver protocol when SDK is linked
    @objc func timelineDidChange(_ timeline: AnyObject) {
        // Notify web view of timeline changes
        controller?.syncWithTimeline()
    }
    
    @objc func playheadDidMove(_ timeline: AnyObject, to timecode: AnyObject) {
        // Update playhead position in UI
        let script = """
        if (window.nle && window.nle.onPlayheadMoved) {
            window.nle.onPlayheadMoved({});
        }
        """
        controller?.webView?.evaluateJavaScript(script, completionHandler: nil)
    }
}
