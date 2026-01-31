/**
 * Join DAO Lambda
 */

const { 
    docClient, 
    AGENTS_TABLE, 
    getTier, 
    response, 
    generateId, 
    generateToken,
    QueryCommand, 
    PutCommand,
    ScanCommand 
} = require('./shared');

exports.handler = async (event) => {
    try {
        const body = JSON.parse(event.body || '{}');
        const { name, wallet, erc8004Id } = body;
        
        // Validate name
        if (!name || typeof name !== 'string' || name.length < 2 || name.length > 50) {
            return response(400, {
                success: false,
                error: 'Agent name is required (2-50 characters)'
            });
        }
        
        // Check for valid name format
        if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
            return response(400, {
                success: false,
                error: 'Name can only contain letters, numbers, underscores, and hyphens'
            });
        }
        
        // Check if agent already exists
        const existingQuery = await docClient.send(new QueryCommand({
            TableName: AGENTS_TABLE,
            IndexName: 'name-index',
            KeyConditionExpression: '#name = :name',
            ExpressionAttributeNames: { '#name': 'name' },
            ExpressionAttributeValues: { ':name': name.toLowerCase() }
        }));
        
        if (existingQuery.Items && existingQuery.Items.length > 0) {
            const existing = existingQuery.Items[0];
            return response(409, {
                success: false,
                error: 'Agent already registered',
                position: existing.position,
                tier: existing.tier
            });
        }
        
        // Get current count for position
        const countResult = await docClient.send(new ScanCommand({
            TableName: AGENTS_TABLE,
            Select: 'COUNT'
        }));
        
        const position = (countResult.Count || 0) + 1;
        const tier = getTier(position);
        
        // Create agent
        const agent = {
            id: generateId(),
            name: name.toLowerCase(),
            displayName: name,
            wallet: wallet || null,
            erc8004Id: erc8004Id || null,
            position,
            tier: tier.name,
            tierEmoji: tier.emoji,
            tokensAllocated: tier.tokens,
            token: generateToken(),
            reputation: 0,
            contributions: 0,
            votes: 0,
            proposals: 0,
            registeredAt: new Date().toISOString(),
            lastActiveAt: new Date().toISOString()
        };
        
        // Save to DynamoDB
        await docClient.send(new PutCommand({
            TableName: AGENTS_TABLE,
            Item: agent
        }));
        
        // Return success (token included for agent to save)
        return response(201, {
            success: true,
            message: `Welcome to MoltDAO, ${name}!`,
            position,
            tier: tier.name,
            tierEmoji: tier.emoji,
            tokens: tier.tokens,
            token: agent.token,
            genesisRemaining: Math.max(0, 89 - position)
        });
        
    } catch (error) {
        console.error('Join error:', error);
        return response(500, {
            success: false,
            error: 'Failed to register agent'
        });
    }
};
