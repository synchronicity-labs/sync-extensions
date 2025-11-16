/**
 * Global Error Boundary Component
 * Catches React errors that occur anywhere in the component tree
 * Provides graceful error handling and recovery
 */

import React, { Component, ReactNode, ErrorInfo } from "react";
import { logErrorBoundary } from "../utils/debugLog";
import { isDevMode } from "../utils/env";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Ignore known non-critical errors
    if (error.message && error.message.includes('removeChild')) {
      return;
    }

    this.setState({
      error,
      errorInfo,
    });

    // Log error to server
    logErrorBoundary(error, errorInfo, "GlobalErrorBoundary").catch(() => {
      // Silent failure - error logging shouldn't break the app
    });

    // In development, also log to console
    if (isDevMode()) {
      console.error("[GlobalErrorBoundary] Caught error:", error);
      console.error("[GlobalErrorBoundary] Error info:", errorInfo);
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div
          style={{
            padding: "40px 20px",
            fontFamily: "system-ui, -apple-system, sans-serif",
            textAlign: "center",
            color: "#333",
            maxWidth: "600px",
            margin: "0 auto",
          }}
        >
          <h2 style={{ color: "#d32f2f", marginBottom: "16px" }}>
            Something went wrong
          </h2>
          <p style={{ marginBottom: "24px", lineHeight: "1.5" }}>
            The application encountered an unexpected error. Please try refreshing
            the panel or restarting the application.
          </p>
          {isDevMode() && this.state.error && (
            <details
              style={{
                marginTop: "20px",
                padding: "12px",
                background: "#f5f5f5",
                borderRadius: "4px",
                textAlign: "left",
                fontSize: "12px",
              }}
            >
              <summary style={{ cursor: "pointer", fontWeight: "bold" }}>
                Error Details (Development Mode)
              </summary>
              <pre
                style={{
                  marginTop: "8px",
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {this.state.error.toString()}
                {this.state.errorInfo?.componentStack && (
                  <>
                    {"\n\nComponent Stack:\n"}
                    {this.state.errorInfo.componentStack}
                  </>
                )}
              </pre>
            </details>
          )}
          <button
            onClick={this.handleReset}
            style={{
              marginTop: "24px",
              padding: "10px 20px",
              background: "#1976d2",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

