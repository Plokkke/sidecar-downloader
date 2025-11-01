declare module 'express-session' {
  interface SessionData {
    otp?: string;
    validated?: boolean;
  }
}

import session from 'express-session-types';

export default session;
