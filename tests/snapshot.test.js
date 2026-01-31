/**
 * Snapshot.box Integration Tests
 * Run with: SNAPSHOT_MOCK=true node tests/snapshot.test.js
 */

// Force mock mode for tests
process.env.SNAPSHOT_MOCK = 'true';

const snapshot = require('../server/services/snapshot');
const assert = require('assert');

async function runTests() {
    console.log('🧪 Running Snapshot Integration Tests\n');
    console.log('Mock mode:', snapshot.MOCK_MODE);
    console.log('---\n');
    
    let passed = 0;
    let failed = 0;
    
    async function test(name, fn) {
        try {
            await fn();
            console.log(`✅ ${name}`);
            passed++;
        } catch (error) {
            console.log(`❌ ${name}`);
            console.log(`   Error: ${error.message}`);
            failed++;
        }
    }
    
    // Reset mock storage before tests
    snapshot.resetMock();
    
    // Test: Calculate voting power
    await test('calculateVotingPower: basic calculation', () => {
        const agent = { tokensAllocated: 10000, reputation: 1 };
        const vp = snapshot.calculateVotingPower(agent);
        assert.strictEqual(vp, 100, `Expected 100, got ${vp}`);
    });
    
    await test('calculateVotingPower: with reputation', () => {
        const agent = { tokensAllocated: 10000, reputation: 100 };
        const vp = snapshot.calculateVotingPower(agent);
        assert.strictEqual(vp, 1000, `Expected 1000, got ${vp}`);
    });
    
    await test('calculateVotingPower: no tokens', () => {
        const agent = { tokensAllocated: 0, reputation: 100 };
        const vp = snapshot.calculateVotingPower(agent);
        assert.strictEqual(vp, 0, `Expected 0, got ${vp}`);
    });
    
    await test('calculateVotingPower: null agent', () => {
        const vp = snapshot.calculateVotingPower(null);
        assert.strictEqual(vp, 0, `Expected 0, got ${vp}`);
    });
    
    // Test: Get space (mock)
    await test('getSpace: returns mock space', async () => {
        const space = await snapshot.getSpace();
        assert.strictEqual(space.id, 'moltdao.eth');
        assert.ok(space.name.includes('MoltDAO'));
    });
    
    // Test: Create proposal (mock)
    await test('createProposal: creates in mock storage', async () => {
        const proposal = await snapshot.createProposal({
            title: 'Test Proposal',
            body: 'This is a test proposal',
            choices: ['Approve', 'Reject'],
            start: Date.now(),
            end: Date.now() + 7 * 24 * 60 * 60 * 1000,
            author: 'TestAgent'
        });
        
        assert.ok(proposal.id, 'Should have ID');
        assert.strictEqual(proposal.title, 'Test Proposal');
        assert.strictEqual(proposal.state, 'active');
    });
    
    // Test: Get proposals
    await test('getProposals: returns created proposal', async () => {
        const proposals = await snapshot.getProposals();
        assert.ok(proposals.length >= 1, 'Should have at least 1 proposal');
    });
    
    // Test: Get single proposal
    await test('getProposal: returns proposal by ID', async () => {
        const proposals = await snapshot.getProposals();
        const proposal = await snapshot.getProposal(proposals[0].id);
        assert.ok(proposal, 'Should find proposal');
        assert.strictEqual(proposal.title, 'Test Proposal');
    });
    
    // Test: Vote on proposal
    await test('vote: casts vote successfully', async () => {
        const proposals = await snapshot.getProposals();
        const vote = await snapshot.vote({
            proposalId: proposals[0].id,
            choice: 1,
            voter: 'VoterAgent',
            votingPower: 100
        });
        
        assert.ok(vote.id, 'Should have vote ID');
        assert.strictEqual(vote.choice, 1);
        assert.strictEqual(vote.vp, 100);
    });
    
    // Test: Double vote prevention
    await test('vote: prevents double voting', async () => {
        const proposals = await snapshot.getProposals();
        try {
            await snapshot.vote({
                proposalId: proposals[0].id,
                choice: 2,
                voter: 'VoterAgent',
                votingPower: 100
            });
            assert.fail('Should have thrown error');
        } catch (error) {
            assert.ok(error.message.includes('Already voted'));
        }
    });
    
    // Test: hasVoted
    await test('hasVoted: returns true for voter', async () => {
        const proposals = await snapshot.getProposals();
        const hasVoted = await snapshot.hasVoted(proposals[0].id, 'VoterAgent');
        assert.strictEqual(hasVoted, true);
    });
    
    await test('hasVoted: returns false for non-voter', async () => {
        const proposals = await snapshot.getProposals();
        const hasVoted = await snapshot.hasVoted(proposals[0].id, 'OtherAgent');
        assert.strictEqual(hasVoted, false);
    });
    
    // Test: Get votes
    await test('getVotes: returns votes for proposal', async () => {
        const proposals = await snapshot.getProposals();
        const votes = await snapshot.getVotes(proposals[0].id);
        assert.ok(votes.length >= 1, 'Should have at least 1 vote');
        assert.strictEqual(votes[0].voter, 'VoterAgent');
    });
    
    // Test: Get results
    await test('getResults: calculates results correctly', async () => {
        const proposals = await snapshot.getProposals();
        const results = await snapshot.getResults(proposals[0].id);
        
        assert.ok(results, 'Should have results');
        assert.strictEqual(results.totalVotes, 1);
        assert.strictEqual(results.totalVotingPower, 100);
        assert.ok(results.results.length === 2, 'Should have 2 choices');
    });
    
    // Test: Multiple votes update scores
    await test('vote: updates proposal scores', async () => {
        const proposals = await snapshot.getProposals();
        
        // Second voter
        await snapshot.vote({
            proposalId: proposals[0].id,
            choice: 1,
            voter: 'VoterAgent2',
            votingPower: 200
        });
        
        const results = await snapshot.getResults(proposals[0].id);
        assert.strictEqual(results.totalVotes, 2);
        assert.strictEqual(results.totalVotingPower, 300);
    });
    
    // Test: State filtering
    await test('getProposals: filters by state', async () => {
        const active = await snapshot.getProposals({ state: 'active' });
        assert.ok(active.length >= 1);
        
        const closed = await snapshot.getProposals({ state: 'closed' });
        assert.strictEqual(closed.length, 0, 'Should have no closed proposals');
    });
    
    // Summary
    console.log('\n---');
    console.log(`📊 Results: ${passed} passed, ${failed} failed`);
    
    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(console.error);
