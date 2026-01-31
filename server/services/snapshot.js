/**
 * Snapshot.box Integration
 * Gasless off-chain voting via GraphQL API
 */

const SNAPSHOT_ENDPOINT = 'https://api.snapshot.box/graphql';
const SPACE_ID = 'moltdao.eth';

/**
 * GraphQL request helper
 */
async function graphql(query, variables = {}) {
    const response = await fetch(SNAPSHOT_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables })
    });
    
    const data = await response.json();
    if (data.errors) {
        throw new Error(data.errors[0].message);
    }
    return data.data;
}

/**
 * Get all proposals for the space
 */
async function getProposals({ state = 'all', first = 20, skip = 0 } = {}) {
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
    
    return result.proposals;
}

/**
 * Get a single proposal by ID
 */
async function getProposal(id) {
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
    return result.proposal;
}

/**
 * Get votes for a proposal
 */
async function getVotes(proposalId, { first = 100, skip = 0 } = {}) {
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
    return result.votes;
}

/**
 * Create a new proposal
 * Note: This requires a signed message from the proposer
 */
async function createProposal({ title, body, choices, start, end, author }) {
    // In production, this would require EIP-712 signature
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
    
    return result.createProposal;
}

/**
 * Cast a vote on a proposal
 * Note: This requires a signed message from the voter
 */
async function vote({ proposalId, choice, voter, votingPower }) {
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
    
    return result.vote;
}

/**
 * Get space info
 */
async function getSpace() {
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
    return result.space;
}

module.exports = {
    getProposals,
    getProposal,
    getVotes,
    createProposal,
    vote,
    getSpace,
    SPACE_ID
};
