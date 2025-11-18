//
//  HTTPBridge.swift
//  sync-fcpx-extension
//
//  Bridges to existing Node.js HTTP server for NLE operations
//  Spawns the backend.ts server process and communicates via HTTP
//

import Foundation
import Cocoa

class HTTPBridge {
    static let shared = HTTPBridge()
    
    private var nodeProcess: Process?
    private let baseURL = "http://127.0.0.1:45791"
    
    func startBackendServer() {
        // Spawn Node.js backend server
        // This uses our existing backend.ts implementation
        
        guard let bundlePath = Bundle.main.resourcePath else { return }
        let backendPath = (bundlePath as NSString).appendingPathComponent("backend.js")
        
        guard FileManager.default.fileExists(atPath: backendPath) else {
            print("⚠️ backend.js not found at: \(backendPath)")
            return
        }
        
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = ["node", backendPath]
        process.currentDirectoryPath = bundlePath
        
        // Set environment
        var env = ProcessInfo.processInfo.environment
        env["HOST_APP"] = "FCPX"
        env["NODE_ENV"] = "production"
        process.environment = env
        
        // Capture output
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        
        do {
            try process.run()
            self.nodeProcess = process
            print("✅ Node.js backend server started")
        } catch {
            print("❌ Failed to start backend server: \(error)")
        }
    }
    
    func stopBackendServer() {
        nodeProcess?.terminate()
        nodeProcess = nil
    }
    
    func callAPI(endpoint: String, method: String = "GET", body: Data? = nil, completion: @escaping (Result<Data, Error>) -> Void) {
        guard let url = URL(string: "\(baseURL)\(endpoint)") else {
            completion(.failure(NSError(domain: "HTTPBridge", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid URL"])))
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                completion(.failure(error))
                return
            }
            
            guard let data = data else {
                completion(.failure(NSError(domain: "HTTPBridge", code: -2, userInfo: [NSLocalizedDescriptionKey: "No data"])))
                return
            }
            
            completion(.success(data))
        }.resume()
    }
}

