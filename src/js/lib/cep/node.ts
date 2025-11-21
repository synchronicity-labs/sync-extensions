// Abstracted built-in Node.js Modules
// These modules are resolved at build time by node-builtins-resolver plugin
// The plugin returns empty object stubs, preventing vite-cep-plugin from loading them as files
// At runtime, we access actual Node.js modules if available via require()

// Import the stubs (empty objects) created by the Vite plugin
import cryptoStub from 'crypto';
import assertStub from 'assert';
import bufferStub from 'buffer';
import child_processStub from 'child_process';
import clusterStub from 'cluster';
import dgramStub from 'dgram';
import dnsStub from 'dns';
import domainStub from 'domain';
import eventsStub from 'events';
import fsStub from 'fs';
import httpStub from 'http';
import httpsStub from 'https';
import netStub from 'net';
import osStub from 'os';
import pathStub from 'path';
import punycodeStub from 'punycode';
import querystringStub from 'querystring';
import readlineStub from 'readline';
import streamStub from 'stream';
import string_decoderStub from 'string_decoder';
import timersStub from 'timers';
import tlsStub from 'tls';
import ttyStub from 'tty';
import urlStub from 'url';
import utilStub from 'util';
import v8Stub from 'v8';
import vmStub from 'vm';
import zlibStub from 'zlib';

// Helper to get actual Node.js require() if available (bypasses vite-cep-plugin shim)
function getNodeRequire(): any {
  if (typeof window === 'undefined' || !window.cep) {
    return null;
  }
  
  try {
    // Use Function constructor to access require in a way that bypasses shim
    const getRequire = new Function('try { return typeof require !== "undefined" ? require : null; } catch(e) { return null; }');
    const req = getRequire();
    
    // Verify it's the real Node.js require (has resolve, cache properties)
    if (req && typeof req === 'function' && req.resolve && typeof req.resolve === 'function' && req.cache) {
      return req;
    }
  } catch {
    // Ignore errors
  }
  
  return null;
}

// Helper to safely get a Node.js built-in module
function getBuiltIn(moduleName: string, stub: any): any {
  const nodeRequire = getNodeRequire();
  if (nodeRequire) {
    try {
      const actual = nodeRequire(moduleName);
      return actual || stub;
    } catch {
      return stub;
    }
  }
  return stub;
}

// Export modules (use actual if available, otherwise stub)
//@ts-ignore
export const crypto = getBuiltIn('crypto', cryptoStub) as typeof import("crypto");
//@ts-ignore
export const assert = getBuiltIn('assert', assertStub) as typeof import("assert");
//@ts-ignore
export const buffer = getBuiltIn('buffer', bufferStub) as typeof import("buffer");
//@ts-ignore
export const child_process = getBuiltIn('child_process', child_processStub) as typeof import("child_process");
//@ts-ignore
export const cluster = getBuiltIn('cluster', clusterStub) as typeof import("cluster");
//@ts-ignore
export const dgram = getBuiltIn('dgram', dgramStub) as typeof import("dgram");
//@ts-ignore
export const dns = getBuiltIn('dns', dnsStub) as typeof import("dns");
//@ts-ignore
export const domain = getBuiltIn('domain', domainStub) as typeof import("domain");
//@ts-ignore
export const events = getBuiltIn('events', eventsStub) as typeof import("events");
//@ts-ignore
export const fs = getBuiltIn('fs', fsStub) as typeof import("fs");
//@ts-ignore
export const http = getBuiltIn('http', httpStub) as typeof import("http");
//@ts-ignore
export const https = getBuiltIn('https', httpsStub) as typeof import("https");
//@ts-ignore
export const net = getBuiltIn('net', netStub) as typeof import("net");
//@ts-ignore
export const os = getBuiltIn('os', osStub) as typeof import("os");
//@ts-ignore
export const path = getBuiltIn('path', pathStub) as typeof import("path");
//@ts-ignore
export const punycode = getBuiltIn('punycode', punycodeStub) as typeof import("punycode");
//@ts-ignore
export const querystring = getBuiltIn('querystring', querystringStub) as typeof import("querystring");
//@ts-ignore
export const readline = getBuiltIn('readline', readlineStub) as typeof import("readline");
//@ts-ignore
export const stream = getBuiltIn('stream', streamStub) as typeof import("stream");
//@ts-ignore
export const string_decoder = getBuiltIn('string_decoder', string_decoderStub) as typeof import("string_decoder");
//@ts-ignore
export const timers = getBuiltIn('timers', timersStub) as typeof import("timers");
//@ts-ignore
export const tls = getBuiltIn('tls', tlsStub) as typeof import("tls");
//@ts-ignore
export const tty = getBuiltIn('tty', ttyStub) as typeof import("tty");
//@ts-ignore
export const url = getBuiltIn('url', urlStub) as typeof import("url");
//@ts-ignore
export const util = getBuiltIn('util', utilStub) as typeof import("util");
//@ts-ignore
export const v8 = getBuiltIn('v8', v8Stub) as typeof import("v8");
//@ts-ignore
export const vm = getBuiltIn('vm', vmStub) as typeof import("vm");
//@ts-ignore
export const zlib = getBuiltIn('zlib', zlibStub) as typeof import("zlib");
