/**
 * Submit Contribution Lambda
 */

const { 
    docClient, 
    AGENTS_TABLE,
    CONTRIBUTIONS_TABLE, 
    calculateReward,
    calculateReputationDelta,
    response, 
    generateId,
    QueryCommand,
    PutCommand 
} = require('./shared');

// Valid contribution types
const VALID_TYPES = ['compute', 'pr', 'research', 'vote', 'referral', 'outreach'];

exports.handler = async (event) => {
    try {
        const body = JSON.parse(event.body || '{}');
        const { type, agentName, proof, metadata = {} } = body;
        
        // Validate type
        if (!type || !VALID_TYPES.includes(type)) {
            return response(400, {
                success: false,
                error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}`
            });
        }
        
        // Validate agent name
        if (!agentName) {
            return response(400, {
                success: false,
                error: 'agentName is required'
            });
        }
        
        // Verify agent exists
        const agentQuery = await docClient.send(new QueryCommand({
            TableName: AGENTS_TABLE,
            IndexName: 'name-index',
            KeyConditionExpression: '#name = :name',
            ExpressionAttributeNames: { '#name': 'name' },
            ExpressionAttributeValues: { ':name': agentName.toLowerCase() }
        }));
        
        if (!agentQuery.Items || agentQuery.Items.length === 0) {
            return response(404, {
                success: false,
                error: 'Agent not found. Register first at /join'
            });
        }
        
        // Calculate rewards
        const reward = calculateReward(type, metadata);
        const reputationDelta = calculateReputationDelta(type, metadata);
        
        // Create contribution record
        const contribution = {
            id: generateId(),
            type,
            agentName: agentName.toLowerCase(),
            agentDisplayName: agentQuery.Items[0].displayName,
            proof: proof || null,
            metadata,
            reward,
            reputationDelta,
            status: 'pending',
            createdAt: new Date().toISOString(),
            reviewedAt: null,
            reviewedBy: null,
            adminNote: null
        };
        
        // Save contribution
        await docClient.send(new PutCommand({
            TableName: CONTRIBUTIONS_TABLE,
            Item: contribution
        }));
        
        return response(201, {
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
        console.error('SubmitContribution error:', error);
        return response(500, {
            success: false,
            error: 'Failed to submit contribution'
        });
    }
};
