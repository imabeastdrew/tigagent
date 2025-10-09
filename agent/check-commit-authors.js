#!/usr/bin/env node

/**
 * Diagnostic script to check what commit authors exist in the database
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

async function checkCommitAuthors() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const projectId = process.env.TEST_PROJECT_ID || 'f0b01975-0226-41d5-b124-802147e02e23';
    
    console.log('\n=== COMMIT AUTHORS DIAGNOSTIC ===\n');
    console.log(`Project ID: ${projectId}\n`);

    // Get all unique authors
    const authorsResult = await pool.query(
      `
      SELECT DISTINCT author, COUNT(*) as commit_count
      FROM commits
      WHERE project_id = $1
      GROUP BY author
      ORDER BY commit_count DESC
      `,
      [projectId]
    );

    console.log('Unique commit authors in database:');
    console.log('-'.repeat(60));
    authorsResult.rows.forEach(row => {
      console.log(`  ${row.author}: ${row.commit_count} commits`);
    });
    console.log('-'.repeat(60));
    console.log(`Total authors: ${authorsResult.rows.length}\n`);

    // Get sample commits from each author
    console.log('Sample commits by author:');
    console.log('='.repeat(60));
    for (const authorRow of authorsResult.rows) {
      const sampleCommits = await pool.query(
        `
        SELECT hash, message, committed_at, author
        FROM commits
        WHERE project_id = $1 AND author = $2
        ORDER BY committed_at DESC
        LIMIT 3
        `,
        [projectId, authorRow.author]
      );

      console.log(`\n${authorRow.author}:`);
      sampleCommits.rows.forEach(commit => {
        console.log(`  - ${commit.committed_at?.toISOString().split('T')[0]} | ${commit.hash.substring(0, 8)} | ${commit.message?.substring(0, 50)}`);
      });
    }
    console.log('\n' + '='.repeat(60));

    // Check if matthewfan2022 exists in interactions but not commits
    const interactionAuthors = await pool.query(
      `
      SELECT DISTINCT i.author, COUNT(*) as interaction_count
      FROM interactions i
      JOIN conversations c ON i.conversation_id = c.id
      WHERE c.project_id = $1
      GROUP BY i.author
      ORDER BY interaction_count DESC
      `,
      [projectId]
    );

    console.log('\n\nInteraction authors (people in conversations):');
    console.log('-'.repeat(60));
    interactionAuthors.rows.forEach(row => {
      console.log(`  ${row.author}: ${row.interaction_count} interactions`);
    });
    console.log('-'.repeat(60));

    // Check for author mismatch
    const commitAuthorSet = new Set(authorsResult.rows.map(r => r.author));
    const interactionAuthorSet = new Set(interactionAuthors.rows.map(r => r.author));
    
    console.log('\n\nAuthor Analysis:');
    console.log('-'.repeat(60));
    console.log(`Authors only in commits: ${[...commitAuthorSet].filter(a => !interactionAuthorSet.has(a)).join(', ') || 'none'}`);
    console.log(`Authors only in interactions: ${[...interactionAuthorSet].filter(a => !commitAuthorSet.has(a)).join(', ') || 'none'}`);
    console.log('-'.repeat(60));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkCommitAuthors().catch(console.error);

