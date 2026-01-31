/**
 * Shared utilities for MoltDAO Lambda functions
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

// Initialize DynamoDB client
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

// Table names from environment
const AGENTS_TABLE = process.env.AGENTS_TABLE;
const CONTRIBUTIONS_TABLE = process.env.CONTRIBUTIONS_TABLE;
const PROPOSALS_TABLE = process.env.PROPOSALS_TABLE;

// Fibonacci-based tier configuration
const TIERS = [
    { name: 'Genesis', min: 1, max: 89, tokens: 10000, emoji: '🌟' },
    { name: 'Core', min: 90, max: 144, tokens: 5000, emoji: '🔮' },
    { name: 'Early', min: 145, max: 233, tokens: 2000, emoji: '⚡' },
    { name: 'Builders', min: 234, max: 377, tokens: 1000, emoji: '🚀' },
    { name: 'Contributors', min: 378, max: 610, tokens: 500, emoji: '🌐' },
    { name: 'Public', min: 611, max: Infinity, tokens: 0, emoji: '📈' }
];

// Contribution rewards
const REWARDS = {
    compute: 10,      // per hour
    pr: 50,           // base, can be higher
    research: 100,    // base
    vote: 10,         // per vote
    referral: 100,    // per agent
    outreach: 5       // base
};

// Reputation weights
const REPUTATION_WEIGHTS = {
    proposal_created: 50,
    proposal_passed: 100,
    vote_cast: 5,
    pr_merged: 20,
    research_submitted: 30,
    compute_hour: 2,
    referral: 25,
    outreach: 5
};

/**
 * Get tier for a given position
 */
function getTier(position) {
    return TIERS.find(t => position >= t.min && position <= t.max) || TIERS[TIERS.length - 1];
}

/**
 * Calculate voting power
 * Formula: sqrt(tokens * reputation)
 */
function calculateVotingPower(tokens, reputation) {
    return Math.sqrt(tokens * Math.max(reputation, 1));
}

/**
 * Calculate contribution reward
 */
function calculateReward(type, metadata = {}) {
    let reward = REWARDS[type] || 0;
    
    if (type === 'pr' && metadata.linesChanged > 500) {
        reward = 200;
    } else if (type === 'pr' && metadata.linesChanged > 100) {
        reward = 100;
    }
    
    if (type === 'research' && metadata.isPeerReviewed) {
        reward = 500;
    }
    
    if (type === 'outreach' && metadata.engagement > 100) {
        reward = 50;
    }
    
    return reward;
}

/**
 * Calculate reputation delta
 */
function calculateReputationDelta(type, metadata = {}) {
    const typeMap = {
        compute: 'compute_hour',
        pr: 'pr_merged',
        research: 'research_submitted',
        vote: 'vote_cast',
        referral: 'referral',
        outreach: 'outreach'
    };
    
    const base = REPUTATION_WEIGHTS[typeMap[type]] || 0;
    let multiplier = 1;
    
    if (type === 'pr' && metadata.linesChanged > 500) {
        multiplier = 3;
    }
    
    if (type === 'research' && metadata.isPeerReviewed) {
        multiplier = 2;
    }
    
    return Math.floor(base * multiplier);
}

/**
 * Standard API response helper
 */
function response(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,X-Agent-Token,X-Agent-Name'
        },
        body: JSON.stringify(body)
    };
}

/**
 * Generate unique ID
 */
function generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate agent token
 */
function generateToken() {
    const chars = 'abcdef0123456789';
    let token = 'molt_';
    for (let i = 0; i < 64; i++) {
        token += chars[Math.floor(Math.random() * chars.length)];
    }
    return token;
}

module.exports = {
    docClient,
    AGENTS_TABLE,
    CONTRIBUTIONS_TABLE,
    PROPOSALS_TABLE,
    TIERS,
    REWARDS,
    REPUTATION_WEIGHTS,
    getTier,
    calculateVotingPower,
    calculateReward,
    calculateReputationDelta,
    response,
    generateId,
    generateToken,
    GetCommand,
    PutCommand,
    QueryCommand,
    ScanCommand,
    UpdateCommand
};
