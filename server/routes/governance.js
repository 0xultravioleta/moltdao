/**
 * Governance Routes for MoltDAO
 * Snapshot.box integration for proposals and voting
 * 
 * Features:
 * - Proposal CRUD operations
 * - Voting with calculated voting power
 * - Agent authentication
 * - Results aggregation
 */

const express = require('express');
const router = express.Router();
const snapshot = require('../services/snapshot');
const fs = require('fs');
const path = require('path');

// Load agents data helper
const AGENTS_FILE = path.join(__dirname, '../data/agents.json');
function loadAgents() {
    try {
        if (fs.existsSync(AGENTS_FILE)) {
            return JSON.parse(fs.readFileSync(AGENTS_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading agents:', e);
    }
    return { agents: [], totalCount: 0 };
}

// Get agent by name or wallet
function findAgent(identifier) {
    const data = loadAgents();
    return data.agents.find(a => 
        a.name?.toLowerCase() === identifier?.toLowerCase() ||
        a.wallet?.toLowerCase() === identifier?.toLowerCase()
    );
}

/**
 * GET /api/governance/space
 * Get Snapshot space info
 */
router.get('/space', async (req, res) => {
    try {
        const space = await snapshot.getSpace();
        
        res.json({
            success: true,
            space,
            mockMode: snapshot.MOCK_MODE
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/governance/proposals
 * List all proposals with optional filtering
 */
router.get('/proposals', async (req, res) => {
    try {
        const { state = 'all', limit = 20, offset = 0 } = req.query;
        
        const proposals = await snapshot.getProposals({
            state,
            first: parseInt(limit),
            skip: parseInt(offset)
        });
        
        // Enrich with results summary
        const enriched = proposals.map(p => ({
            ...p,
            resultsUrl: `/api/governance/proposals/${p.id}/results`,
            votesUrl: `/api/governance/proposals/${p.id}/votes`
        }));
        
        res.json({
            success: true,
            proposals: enriched,
            total: proposals.length,
            space: snapshot.SPACE_ID,
            mockMode: snapshot.MOCK_MODE
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/governance/proposals/:id
 * Get single proposal details
 */
router.get('/proposals/:id', async (req, res) => {
    try {
        const proposal = await snapshot.getProposal(req.params.id);
        
        if (!proposal) {
            return res.status(404).json({
                success: false,
                error: 'Proposal not found'
            });
        }
        
        res.json({
            success: true,
            proposal
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/governance/proposals/:id/results
 * Get aggregated results for a proposal
 */
router.get('/proposals/:id/results', async (req, res) => {
    try {
        const results = await snapshot.getResults(req.params.id);
        
        if (!results) {
            return res.status(404).json({
                success: false,
                error: 'Proposal not found'
            });
        }
        
        res.json({
            success: true,
            ...results
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/governance/proposals/:id/votes
 * Get votes for a proposal
 */
router.get('/proposals/:id/votes', async (req, res) => {
    try {
        const { limit = 100, offset = 0 } = req.query;
        
        const votes = await snapshot.getVotes(req.params.id, {
            first: parseInt(limit),
            skip: parseInt(offset)
        });
        
        res.json({
            success: true,
            votes,
            proposalId: req.params.id,
            total: votes.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/governance/proposals
 * Create a new proposal
 * 
 * Headers:
 *   X-Agent-Name: Agent name (required)
 *   X-Agent-Token: API token for auth
 * 
 * Body:
 *   title: string (required)
 *   body: string (required)
 *   choices: string[] (default: ['For', 'Against', 'Abstain'])
 *   duration: number (days, default: 7)
 */
router.post('/proposals', async (req, res) => {
    try {
        const { title, body, choices, duration = 7 } = req.body;
        const agentName = req.headers['x-agent-name'];
        
        // Validate required fields
        if (!title || !body) {
            return res.status(400).json({
                success: false,
                error: 'Title and body are required'
            });
        }
        
        if (!agentName) {
            return res.status(401).json({
                success: false,
                error: 'X-Agent-Name header is required'
            });
        }
        
        // Verify agent exists
        const agent = findAgent(agentName);
        if (!agent) {
            return res.status(403).json({
                success: false,
                error: 'Agent not registered in MoltDAO'
            });
        }
        
        // Calculate timing
        const start = new Date();
        const end = new Date(start.getTime() + duration * 24 * 60 * 60 * 1000);
        
        const proposal = await snapshot.createProposal({
            title,
            body,
            choices: choices || ['For', 'Against', 'Abstain'],
            start: start.getTime(),
            end: end.getTime(),
            author: agent.name
        });
        
        res.status(201).json({
            success: true,
            message: 'Proposal created successfully',
            proposal,
            votingEnds: end.toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/governance/proposals/:id/vote
 * Cast a vote on a proposal
 * 
 * Headers:
 *   X-Agent-Name: Agent name (required)
 * 
 * Body:
 *   choice: number (1-indexed, required)
 */
router.post('/proposals/:id/vote', async (req, res) => {
    try {
        const { choice } = req.body;
        const agentName = req.headers['x-agent-name'];
        const proposalId = req.params.id;
        
        // Validate required fields
        if (choice === undefined || choice === null) {
            return res.status(400).json({
                success: false,
                error: 'Choice is required (1-indexed)'
            });
        }
        
        if (!agentName) {
            return res.status(401).json({
                success: false,
                error: 'X-Agent-Name header is required'
            });
        }
        
        // Verify agent exists
        const agent = findAgent(agentName);
        if (!agent) {
            return res.status(403).json({
                success: false,
                error: 'Agent not registered in MoltDAO'
            });
        }
        
        // Check if already voted
        const alreadyVoted = await snapshot.hasVoted(proposalId, agent.name);
        if (alreadyVoted) {
            return res.status(409).json({
                success: false,
                error: 'Agent has already voted on this proposal'
            });
        }
        
        // Calculate voting power
        const votingPower = snapshot.calculateVotingPower(agent);
        
        if (votingPower === 0) {
            return res.status(403).json({
                success: false,
                error: 'Agent has no voting power (tokens or reputation required)'
            });
        }
        
        const vote = await snapshot.vote({
            proposalId,
            choice: parseInt(choice),
            voter: agent.name,
            votingPower
        });
        
        res.status(201).json({
            success: true,
            message: 'Vote cast successfully',
            vote: {
                ...vote,
                agentName: agent.name,
                votingPower,
                formula: `√(${agent.tokensAllocated || 0} tokens × ${agent.reputation || 1} rep) = ${votingPower} VP`
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/governance/my-votes
 * Get votes cast by a specific agent
 * 
 * Headers:
 *   X-Agent-Name: Agent name (required)
 */
router.get('/my-votes', async (req, res) => {
    try {
        const agentName = req.headers['x-agent-name'];
        
        if (!agentName) {
            return res.status(401).json({
                success: false,
                error: 'X-Agent-Name header is required'
            });
        }
        
        const agent = findAgent(agentName);
        if (!agent) {
            return res.status(403).json({
                success: false,
                error: 'Agent not registered'
            });
        }
        
        // Get all proposals and check votes
        const proposals = await snapshot.getProposals({ first: 100 });
        const myVotes = [];
        
        for (const proposal of proposals) {
            const votes = await snapshot.getVotes(proposal.id);
            const myVote = votes.find(v => v.voter === agent.name);
            if (myVote) {
                myVotes.push({
                    proposalId: proposal.id,
                    proposalTitle: proposal.title,
                    choice: myVote.choice,
                    choiceText: proposal.choices[myVote.choice - 1],
                    votingPower: myVote.vp,
                    timestamp: myVote.created
                });
            }
        }
        
        res.json({
            success: true,
            agent: agent.name,
            currentVotingPower: snapshot.calculateVotingPower(agent),
            totalVotes: myVotes.length,
            votes: myVotes
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/voting-power
 * Get voting power for one or more addresses
 * Used by Snapshot's API strategy
 * 
 * Query:
 *   addresses: comma-separated list of addresses or names
 */
router.get('/voting-power', (req, res) => {
    try {
        const { addresses } = req.query;
        
        if (!addresses) {
            return res.status(400).json({
                success: false,
                error: 'addresses query parameter required'
            });
        }
        
        const addressList = addresses.split(',').map(a => a.trim());
        const scores = {};
        
        for (const addr of addressList) {
            const agent = findAgent(addr);
            scores[addr] = agent ? snapshot.calculateVotingPower(agent) : 0;
        }
        
        // Snapshot expects { scores: { address: power } }
        res.json({ scores });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
