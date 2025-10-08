import { validateAndBuildSQL } from './dist/validator.js';

// Create a simple query plan to test SQL generation
const testPlan = {
  entities: ['commits'],
  columns: ['id', 'hash', 'message', 'committed_at', 'author', 'branch', 'project_id'],
  joins: [
    {
      left_table: 'commits',
      right_table: 'projects',
      type: 'INNER'
    }
  ],
  filters: [],
  time_window: {
    days_back: 30
  },
  aggregations: [],
  group_by: [],
  intent_summary: 'Test query'
};

console.log('Testing SQL generation...');
console.log('Plan:', JSON.stringify(testPlan, null, 2));

try {
  const result = validateAndBuildSQL(testPlan, 'f0b01975-0226-41d5-b124-802147e02e23');
  console.log('Validation result:', result);
  if (result.safeSQL) {
    console.log('Generated SQL:');
    console.log(result.safeSQL);
  }
} catch (error) {
  console.error('Error:', error);
}
