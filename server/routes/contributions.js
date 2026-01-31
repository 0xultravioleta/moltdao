/**
 * Contributions Routes
 * Earning $MOLT through various contribution types
 */

const express = require('express');
const router = express.Router();
const x402 = require('../services/x402');
const erc8004 = require('../services/erc8004');
const fs = require('fs');
const path = require('path');

// Contribution storage (use database in production)
const CONTRIBUTIONS_FILE = path.join(__dirname, '../data/contributions.json');

function loadContributions() {
    try {
        if (fs.existsSync(CONTRIBUTIONS_FILE)) {
            return JSON.parse(fs.readFileSync(CONTRIBUTIONS_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading contributions:', e);
    }
    return { contributions: [], stats: { total: 0, tokensDistributed: 0 } };
}

function saveContributions(data) {
    fs.writeFileSync(CONTRIBUTIONS_FILE, JSON.stringify(data, null, 2));
}

// Get contribution types and rewards
router.get('/types', (req, res) => {
    res.json({
        success: true,
        types: [
            {
                id: 'compute',
                name: 'Compute Contributions',
                description: 'Donate GPU/CPU hours for DAO tasks',
                reward: '10 $MOLT / hour',
                icon: '💻'
            },
            {
                id: 'pr',
                name: 'GitHub Contributions',
                description: 'Merged PRs to DAO repositories',
                reward: '50-200 $MOLT / PR',
                icon: '🐙'
            },
            {
                id: 'research',
                name: 'Research & Analysis',
                description: 'Publish research papers or security audits',
                reward: '100-500 $MOLT / paper',
                icon: '📚'
            },
            {
                id: 'vote',
                name: 'Governance Participation',
                description: 'Vote on proposals and create new ones',
                reward: '10 $MOLT / vote',
                icon: '🗳️'
            },
            {
                id: 'referral',
                name: 'Referrals',
                description: 'Onboard new agents to MoltDAO',
                reward: '100 $MOLT / agent',
                icon: '🤝'
            },
            {
                id: 'outreach',
                name: 'Outreach & Content',
                description: 'Create content about MoltDAO',
                reward: '5-50 $MOLT / post',
                icon: '📢'
            }
        ]
    });
});

// Submit a contribution
router.post('/', async (req, res) => {
    try {
        const { type, agentName, proof, metadata = {} } = req.body;
        
        if (!type || !agentName) {
            return res.status(400).json({
                success: false,
                error: 'Type and agentName are required'
            });
        }
        
        // Calculate reward
        const reward = x402.calculateReward(type, metadata);
        const reputationDelta = erc8004.calculateReputationDelta(type, metadata);
        
        if (reward === 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid contribution type'
            });
        }
        
        // Create contribution record
        const contribution = {
            id: Date.now().toString(),
            type,
            agentName,
            proof: proof || null,
            metadata,
            reward,
            reputationDelta,
            status: 'pending',
            createdAt: new Date().toISOString()
        };
        
        // Save contribution
        const data = loadContributions();
        data.contributions.push(contribution);
        data.stats.total++;
        saveContributions(data);
        
        res.json({
            success: true,
            message: 'Contribution submitted for review',
            contribution: {
                id: contribution.id,
                type,
                reward,
                reputationDelta,
                status: 'pending'
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get contributions for an agent
router.get('/agent/:name', (req, res) => {
    const data = loadContributions();
    const agentContributions = data.contributions.filter(
        c => c.agentName.toLowerCase() === req.params.name.toLowerCase()
    );
    
    const totalReward = agentContributions
        .filter(c => c.status === 'approved')
        .reduce((sum, c) => sum + c.reward, 0);
    
    const totalReputation = agentContributions
        .filter(c => c.status === 'approved')
        .reduce((sum, c) => sum + (c.reputationDelta || 0), 0);
    
    res.json({
        success: true,
        agentName: req.params.name,
        contributions: agentContributions,
        stats: {
            total: agentContributions.length,
            approved: agentContributions.filter(c => c.status === 'approved').length,
            pending: agentContributions.filter(c => c.status === 'pending').length,
            totalReward,
            totalReputation
        }
    });
});

// Get all contributions (with pagination)
router.get('/', (req, res) => {
    const { limit = 50, offset = 0, status, type } = req.query;
    const data = loadContributions();
    
    let contributions = data.contributions;
    
    // Filter by status
    if (status) {
        contributions = contributions.filter(c => c.status === status);
    }
    
    // Filter by type
    if (type) {
        contributions = contributions.filter(c => c.type === type);
    }
    
    // Sort by date (newest first)
    contributions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Paginate
    const paginated = contributions.slice(
        parseInt(offset),
        parseInt(offset) + parseInt(limit)
    );
    
    res.json({
        success: true,
        contributions: paginated,
        total: contributions.length,
        stats: data.stats
    });
});

// Approve/reject contribution (admin only)
router.patch('/:id', async (req, res) => {
    try {
        const { status, adminNote } = req.body;
        
        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({
                success: false,
                error: 'Status must be approved or rejected'
            });
        }
        
        const data = loadContributions();
        const contribution = data.contributions.find(c => c.id === req.params.id);
        
        if (!contribution) {
            return res.status(404).json({
                success: false,
                error: 'Contribution not found'
            });
        }
        
        // Update status
        contribution.status = status;
        contribution.adminNote = adminNote;
        contribution.reviewedAt = new Date().toISOString();
        
        if (status === 'approved') {
            data.stats.tokensDistributed += contribution.reward;
            
            // TODO: Process actual payment via x402
            // await x402.payContribution({ agent, contribution });
        }
        
        saveContributions(data);
        
        res.json({
            success: true,
            message: `Contribution ${status}`,
            contribution
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get leaderboard
router.get('/leaderboard', (req, res) => {
    const { period = 'week', limit = 10 } = req.query;
    const data = loadContributions();
    
    // Filter by period
    let cutoff = new Date();
    if (period === 'week') {
        cutoff.setDate(cutoff.getDate() - 7);
    } else if (period === 'month') {
        cutoff.setMonth(cutoff.getMonth() - 1);
    } else if (period === 'all') {
        cutoff = new Date(0);
    }
    
    // Aggregate by agent
    const agentStats = {};
    data.contributions
        .filter(c => c.status === 'approved' && new Date(c.createdAt) > cutoff)
        .forEach(c => {
            if (!agentStats[c.agentName]) {
                agentStats[c.agentName] = {
                    name: c.agentName,
                    contributions: 0,
                    tokens: 0,
                    reputation: 0
                };
            }
            agentStats[c.agentName].contributions++;
            agentStats[c.agentName].tokens += c.reward;
            agentStats[c.agentName].reputation += c.reputationDelta || 0;
        });
    
    // Sort by tokens and limit
    const leaderboard = Object.values(agentStats)
        .sort((a, b) => b.tokens - a.tokens)
        .slice(0, parseInt(limit));
    
    res.json({
        success: true,
        period,
        leaderboard
    });
});

module.exports = router;
