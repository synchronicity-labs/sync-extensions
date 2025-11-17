/**
 * Express request type extensions
 * Extends Express Request interface with custom properties used throughout the server
 */

import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      /**
       * Authentication token for the current request
       */
      authToken?: string;
      
      /**
       * Array of jobs stored in memory
       */
      jobs?: Array<{
        id: string;
        status: string;
        [key: string]: unknown;
      }>;
      
      /**
       * Function to save jobs to disk
       */
      saveJobs?: () => void;
      
      /**
       * Raw request body (used for gzip-compressed data)
       */
      rawBody?: Buffer;
    }
  }
}

export {};

