/**
 * Governance Routes
 * Snapshot.box integration for proposals and voting
 */

const express = require('express');
const router = express.Router();
const snapshot = require('../services/snapshot');

// Get all proposals
router.get('/proposals', async (req, res) => {
    try {
        const { state = 'all', limit = 20, offset = 0 } = req.query;
        
        const proposals = await snapshot.getProposals({
            state,
            first: parseInt(limit),
            skip: parseInt(offset)
        });
        
        res.json({
            success: true,
            proposals,
            total: proposals.length,
            space: snapshot.SPACE_ID
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get single proposal
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

// Get votes for a proposal
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
            proposalId: req.params.id
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Create proposal (requires auth)
router.post('/proposals', async (req, res) => {
    try {
        const { title, body, choices, duration = 7 } = req.body;
        
        if (!title || !body) {
            return res.status(400).json({
                success: false,
                error: 'Title and body are required'
            });
        }
        
        // Calculate start and end times
        const start = new Date();
        const end = new Date(start.getTime() + duration * 24 * 60 * 60 * 1000);
        
        // TODO: Verify agent auth
        const author = req.headers['x-agent-name'] || 'anonymous';
        
        const proposal = await snapshot.createProposal({
            title,
            body,
            choices: choices || ['For', 'Against', 'Abstain'],
            start: start.getTime(),
            end: end.getTime(),
            author
        });
        
        res.json({
            success: true,
            message: 'Proposal created',
            proposal
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Cast vote (requires auth)
router.post('/proposals/:id/vote', async (req, res) => {
    try {
        const { choice } = req.body;
        
        if (choice === undefined) {
            return res.status(400).json({
                success: false,
                error: 'Choice is required'
            });
        }
        
        // TODO: Get agent from auth
        const voter = req.headers['x-agent-name'] || 'anonymous';
        const votingPower = parseFloat(req.headers['x-voting-power']) || 1;
        
        const vote = await snapshot.vote({
            proposalId: req.params.id,
            choice: parseInt(choice),
            voter,
            votingPower
        });
        
        res.json({
            success: true,
            message: 'Vote cast',
            vote
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get space info
router.get('/space', async (req, res) => {
    try {
        const space = await snapshot.getSpace();
        
        res.json({
            success: true,
            space
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
