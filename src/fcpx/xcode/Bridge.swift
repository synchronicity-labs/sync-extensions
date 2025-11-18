//
//  Bridge.swift
//  sync-fcpx-extension
//
//  Bridge between JavaScript and native FCPX APIs
//  Handles HTTP server communication and FCPX API calls
//

import Foundation
import WebKit

class FCPXBridge {
    static let shared = FCPXBridge()
    
    private var httpServer: HTTPServer?
    private let serverPort: UInt16 = 45791
    
    func startServer() {
        // Start HTTP server for NLE operations
        // This bridges to our existing backend.ts implementation
        httpServer = HTTPServer(port: serverPort)
        httpServer?.start()
    }
    
    func stopServer() {
        httpServer?.stop()
    }
}

// Simple HTTP server for NLE endpoints
class HTTPServer {
    private let port: UInt16
    private var isRunning = false
    
    init(port: UInt16) {
        self.port = port
    }
    
    func start() {
        // In a real implementation, this would start an HTTP server
        // For now, we'll use the existing Node.js backend via spawn
        // The extension can communicate with it via HTTP
        isRunning = true
    }
    
    func stop() {
        isRunning = false
    }
}

