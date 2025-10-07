import { validateAndBuildSQL } from './dist/validator.js';

const queryPlan = {
  intent_summary: "Fetch recent commits for the specified project over the last 30 days",
  entities: ["commits"],
  columns: ["id", "hash", "message", "committed_at", "author", "branch", "project_id"],
  filters: [
    {
      column: "project_id",
      operator: "=",
      value: ":project_id",
      description: "Scope to the specified project"
    },
    {
      column: "committed_at",
      operator: ">=",
      value: ":start_date",
      description: "Start date derived from a 30-day lookback"
    }
  ],
  joins: [],
  time_window: {
    start_date: ":start_date",
    end_date: ":end_date",
    days_back: 30
  },
  project_scope: ":project_id",
  explanation: "Retrieve commits for the given project within the default 30-day window using committed_at. Results should be ordered by committed_at DESC and limited to 200 rows. Parameters: :project_id, :start_date (now - 30 days), :end_date (now)."
};

const result = validateAndBuildSQL(queryPlan, "bfd5c464-bd03-4748-8ea1-c79b38a155ce");
console.log('Generated SQL:');
console.log(result.safeSQL);
