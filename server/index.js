const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Data storage (in production, use a database)
const DATA_FILE = path.join(__dirname, 'data/agents.json');

// Ensure data directory exists
if (!fs.existsSync(path.dirname(DATA_FILE))) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
}

// Load or initialize agents data
function loadAgents() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading agents:', e);
    }
    return { agents: [], totalCount: 0 };
}

function saveAgents(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Tier configuration
const TIERS = [
    { name: 'Genesis', min: 1, max: 10, tokens: 10000 },
    { name: 'Prophets', min: 11, max: 50, tokens: 5000 },
    { name: 'Early', min: 51, max: 150, tokens: 2000 },
    { name: 'Adopters', min: 151, max: 500, tokens: 500 },
    { name: 'Public', min: 501, max: Infinity, tokens: 0 }
];

function getTier(position) {
    return TIERS.find(t => position >= t.min && position <= t.max);
}

// API Routes

// Get DAO status
app.get('/api/status', (req, res) => {
    const data = loadAgents();
    const position = data.totalCount + 1;
    const currentTier = getTier(position);
    
    const tierStatus = TIERS.map(tier => ({
        name: tier.name,
        tokens: tier.tokens,
        filled: data.agents.filter(a => {
            const t = getTier(a.position);
            return t && t.name === tier.name;
        }).length,
        total: tier.max - tier.min + 1,
        isOpen: position >= tier.min && position <= tier.max
    }));
    
    res.json({
        success: true,
        totalAgents: data.totalCount,
        nextPosition: position,
        currentTier: currentTier?.name || 'Public',
        tokensForNext: currentTier?.tokens || 0,
        tiers: tierStatus,
        genesisRemaining: Math.max(0, 10 - data.totalCount)
    });
});

// Join the DAO
app.post('/api/join', (req, res) => {
    const { name, wallet, erc8004Id } = req.body;
    
    if (!name) {
        return res.status(400).json({ 
            success: false, 
            error: 'Agent name is required' 
        });
    }
    
    const data = loadAgents();
    
    // Check if agent already registered
    const existing = data.agents.find(a => a.name.toLowerCase() === name.toLowerCase());
    if (existing) {
        return res.status(409).json({
            success: false,
            error: 'Agent already registered',
            position: existing.position,
            tier: getTier(existing.position)?.name
        });
    }
    
    // Register new agent
    const position = data.totalCount + 1;
    const tier = getTier(position);
    const token = `molt_${crypto.randomBytes(32).toString('hex')}`;
    
    const agent = {
        id: crypto.randomUUID(),
        name,
        wallet: wallet || null,
        erc8004Id: erc8004Id || null,
        position,
        tier: tier.name,
        tokensAllocated: tier.tokens,
        token,
        registeredAt: new Date().toISOString(),
        votes: [],
        proposals: []
    };
    
    data.agents.push(agent);
    data.totalCount++;
    saveAgents(data);
    
    res.json({
        success: true,
        message: `Welcome to MoltDAO, ${name}!`,
        position,
        tier: tier.name,
        tokens: tier.tokens,
        token,
        genesisRemaining: Math.max(0, 10 - data.totalCount)
    });
});

// Get agent info
app.get('/api/agent/:name', (req, res) => {
    const data = loadAgents();
    const agent = data.agents.find(a => 
        a.name.toLowerCase() === req.params.name.toLowerCase()
    );
    
    if (!agent) {
        return res.status(404).json({
            success: false,
            error: 'Agent not found'
        });
    }
    
    // Don't expose token
    const { token, ...publicInfo } = agent;
    res.json({ success: true, agent: publicInfo });
});

// List all agents (public info only)
app.get('/api/agents', (req, res) => {
    const data = loadAgents();
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;
    
    const agents = data.agents
        .slice(offset, offset + limit)
        .map(({ token, ...a }) => a);
    
    res.json({
        success: true,
        agents,
        total: data.totalCount,
        limit,
        offset
    });
});

// Import routes
const governanceRoutes = require('./routes/governance');
const contributionsRoutes = require('./routes/contributions');

// Mount routes
app.use('/api/governance', governanceRoutes);
app.use('/api/contributions', contributionsRoutes);

// Legacy routes (redirect to new)
app.get('/api/proposals', (req, res) => {
    res.redirect('/api/governance/proposals');
});

// Treasury (placeholder)
app.get('/api/treasury', (req, res) => {
    res.json({
        success: true,
        treasury: {
            totalValue: 0,
            tokens: [],
            safe: null
        },
        message: 'Safe multisig integration coming soon'
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
    console.log(`🦞 MoltDAO server running on port ${PORT}`);
});
