/**
 * Snapshot.box Integration for MoltDAO
 * Gasless off-chain voting via GraphQL API
 * 
 * Features:
 * - GraphQL client for Snapshot API
 * - Mock mode for local development
 * - Custom voting power calculation
 * - Agent-wallet mapping
 */

const SNAPSHOT_ENDPOINT = process.env.SNAPSHOT_ENDPOINT || 'https://api.snapshot.box/graphql';
const SPACE_ID = process.env.SNAPSHOT_SPACE || 'moltdao.eth';
const MOCK_MODE = process.env.SNAPSHOT_MOCK === 'true';

// Mock storage for development
const mockStorage = {
    proposals: [],
    votes: {},
    proposalCounter: 0
};

/**
 * GraphQL request helper
 */
async function graphql(query, variables = {}) {
    if (MOCK_MODE) {
        console.log('[MOCK] GraphQL query:', query.slice(0, 50) + '...');
        return null; // Mock handlers below
    }
    
    try {
        const response = await fetch(SNAPSHOT_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query, variables })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        if (data.errors) {
            throw new Error(data.errors[0].message);
        }
        return data.data;
    } catch (error) {
        console.error('[Snapshot] GraphQL error:', error.message);
        throw error;
    }
}

/**
 * Calculate voting power for an agent
 * Formula: √(TokensAllocated × Reputation)
 * 
 * @param {Object} agent - Agent object with tokensAllocated and reputation
 * @returns {number} Voting power (rounded)
 */
function calculateVotingPower(agent) {
    if (!agent) return 0;
    
    const tokens = agent.tokensAllocated || 0;
    const reputation = agent.reputation || 1;
    
    // Square root of product gives balanced weight
    // - New agent with 10K tokens, 1 rep = √10000 = 100 VP
    // - Active agent with 10K tokens, 100 rep = √1000000 = 1000 VP
    return Math.floor(Math.sqrt(tokens * reputation));
}

/**
 * Get all proposals for the space
 */
async function getProposals({ state = 'all', first = 20, skip = 0 } = {}) {
    if (MOCK_MODE) {
        let filtered = mockStorage.proposals;
        if (state !== 'all') {
            filtered = filtered.filter(p => p.state === state);
        }
        return filtered.slice(skip, skip + first);
    }
    
    const query = `
        query Proposals($space: String!, $state: String!, $first: Int!, $skip: Int!) {
            proposals(
                where: { space: $space, state: $state }
                first: $first
                skip: $skip
                orderBy: "created"
                orderDirection: desc
            ) {
                id
                title
                body
                choices
                start
                end
                state
                author
                created
                scores
                scores_total
                votes
            }
        }
    `;
    
    const stateFilter = state === 'all' ? '' : state;
    const result = await graphql(query, {
        space: SPACE_ID,
        state: stateFilter,
        first,
        skip
    });
    
    return result?.proposals || [];
}

/**
 * Get a single proposal by ID
 */
async function getProposal(id) {
    if (MOCK_MODE) {
        return mockStorage.proposals.find(p => p.id === id) || null;
    }
    
    const query = `
        query Proposal($id: String!) {
            proposal(id: $id) {
                id
                title
                body
                choices
                start
                end
                state
                author
                created
                scores
                scores_total
                votes
                quorum
                privacy
            }
        }
    `;
    
    const result = await graphql(query, { id });
    return result?.proposal || null;
}

/**
 * Get votes for a proposal
 */
async function getVotes(proposalId, { first = 100, skip = 0 } = {}) {
    if (MOCK_MODE) {
        const votes = mockStorage.votes[proposalId] || [];
        return votes.slice(skip, skip + first);
    }
    
    const query = `
        query Votes($proposal: String!, $first: Int!, $skip: Int!) {
            votes(
                where: { proposal: $proposal }
                first: $first
                skip: $skip
                orderBy: "created"
                orderDirection: desc
            ) {
                id
                voter
                choice
                vp
                created
            }
        }
    `;
    
    const result = await graphql(query, { proposal: proposalId, first, skip });
    return result?.votes || [];
}

/**
 * Create a new proposal
 * 
 * @param {Object} params - Proposal parameters
 * @param {string} params.title - Proposal title
 * @param {string} params.body - Proposal body (markdown supported)
 * @param {string[]} params.choices - Voting options
 * @param {number} params.start - Start timestamp (ms)
 * @param {number} params.end - End timestamp (ms)
 * @param {string} params.author - Author identifier
 * @returns {Object} Created proposal
 */
async function createProposal({ title, body, choices, start, end, author }) {
    if (MOCK_MODE) {
        const proposal = {
            id: `mock-${++mockStorage.proposalCounter}`,
            title,
            body,
            choices: choices || ['For', 'Against', 'Abstain'],
            start: Math.floor(start / 1000),
            end: Math.floor(end / 1000),
            state: 'active',
            author,
            created: Math.floor(Date.now() / 1000),
            scores: new Array(choices?.length || 3).fill(0),
            scores_total: 0,
            votes: 0
        };
        mockStorage.proposals.push(proposal);
        mockStorage.votes[proposal.id] = [];
        console.log(`[MOCK] Created proposal: ${proposal.id} - "${title}"`);
        return proposal;
    }
    
    // Note: Real implementation requires EIP-712 signature
    // This would typically be done client-side with user's wallet
    const query = `
        mutation CreateProposal($input: ProposalInput!) {
            createProposal(input: $input) {
                id
                author
                state
                created
            }
        }
    `;
    
    const result = await graphql(query, {
        input: {
            space: SPACE_ID,
            type: 'single-choice',
            title,
            body,
            choices: choices || ['For', 'Against', 'Abstain'],
            start: Math.floor(start / 1000),
            end: Math.floor(end / 1000),
            author
        }
    });
    
    return result?.createProposal || null;
}

/**
 * Cast a vote on a proposal
 * 
 * @param {Object} params - Vote parameters
 * @param {string} params.proposalId - Proposal ID
 * @param {number} params.choice - Choice index (1-indexed)
 * @param {string} params.voter - Voter identifier
 * @param {number} params.votingPower - Voting power
 * @returns {Object} Vote record
 */
async function vote({ proposalId, choice, voter, votingPower }) {
    if (MOCK_MODE) {
        const proposal = mockStorage.proposals.find(p => p.id === proposalId);
        if (!proposal) {
            throw new Error('Proposal not found');
        }
        
        // Check if already voted
        const existingVote = mockStorage.votes[proposalId]?.find(v => v.voter === voter);
        if (existingVote) {
            throw new Error('Already voted on this proposal');
        }
        
        const voteRecord = {
            id: `vote-${proposalId}-${voter}`,
            voter,
            choice,
            vp: votingPower,
            created: Math.floor(Date.now() / 1000)
        };
        
        mockStorage.votes[proposalId] = mockStorage.votes[proposalId] || [];
        mockStorage.votes[proposalId].push(voteRecord);
        
        // Update proposal scores
        const choiceIndex = choice - 1;
        if (proposal.scores[choiceIndex] !== undefined) {
            proposal.scores[choiceIndex] += votingPower;
            proposal.scores_total += votingPower;
            proposal.votes += 1;
        }
        
        console.log(`[MOCK] Vote cast: ${voter} -> choice ${choice} (${votingPower} VP)`);
        return voteRecord;
    }
    
    // Note: Real implementation requires EIP-712 signature
    const query = `
        mutation Vote($input: VoteInput!) {
            vote(input: $input) {
                id
                voter
                choice
                vp
            }
        }
    `;
    
    const result = await graphql(query, {
        input: {
            space: SPACE_ID,
            proposal: proposalId,
            choice,
            voter,
            vp: votingPower
        }
    });
    
    return result?.vote || null;
}

/**
 * Get space info
 */
async function getSpace() {
    if (MOCK_MODE) {
        return {
            id: SPACE_ID,
            name: 'MoltDAO (Mock)',
            about: 'The first DAO governed entirely by AI agents (mock mode)',
            network: '8453',
            symbol: 'MOLT',
            members: mockStorage.proposals.length > 0 ? ['mock-member'] : [],
            admins: ['mock-admin'],
            voting: {
                delay: 0,
                period: 604800,
                quorum: 0.1
            }
        };
    }
    
    const query = `
        query Space($id: String!) {
            space(id: $id) {
                id
                name
                about
                network
                symbol
                members
                admins
                voting {
                    delay
                    period
                    quorum
                }
            }
        }
    `;
    
    const result = await graphql(query, { id: SPACE_ID });
    return result?.space || null;
}

/**
 * Check if a voter has already voted
 */
async function hasVoted(proposalId, voter) {
    if (MOCK_MODE) {
        return mockStorage.votes[proposalId]?.some(v => v.voter === voter) || false;
    }
    
    const query = `
        query HasVoted($proposal: String!, $voter: String!) {
            votes(where: { proposal: $proposal, voter: $voter }) {
                id
            }
        }
    `;
    
    const result = await graphql(query, { proposal: proposalId, voter });
    return (result?.votes?.length || 0) > 0;
}

/**
 * Get proposal results summary
 */
async function getResults(proposalId) {
    const proposal = await getProposal(proposalId);
    if (!proposal) return null;
    
    const results = proposal.choices.map((choice, index) => ({
        choice,
        score: proposal.scores[index] || 0,
        percentage: proposal.scores_total > 0 
            ? ((proposal.scores[index] || 0) / proposal.scores_total * 100).toFixed(1)
            : '0.0'
    }));
    
    const winner = results.reduce((max, r) => r.score > max.score ? r : max, results[0]);
    
    return {
        proposalId,
        title: proposal.title,
        state: proposal.state,
        totalVotes: proposal.votes,
        totalVotingPower: proposal.scores_total,
        results,
        winner: winner?.choice,
        quorumReached: proposal.scores_total >= (proposal.quorum || 0),
        endTime: new Date(proposal.end * 1000).toISOString()
    };
}

/**
 * Reset mock storage (for testing)
 */
function resetMock() {
    if (MOCK_MODE) {
        mockStorage.proposals = [];
        mockStorage.votes = {};
        mockStorage.proposalCounter = 0;
        console.log('[MOCK] Storage reset');
    }
}

module.exports = {
    getProposals,
    getProposal,
    getVotes,
    createProposal,
    vote,
    getSpace,
    hasVoted,
    getResults,
    calculateVotingPower,
    resetMock,
    SPACE_ID,
    MOCK_MODE
};
