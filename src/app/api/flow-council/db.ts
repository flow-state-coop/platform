// Re-export so council routes keep a single import site while the connection
// itself is shared with non-council APIs (flow-splitter).
export { db } from "../db";
