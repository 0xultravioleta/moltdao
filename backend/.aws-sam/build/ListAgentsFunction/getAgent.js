/**
 * Get Agent Lambda
 */

const { docClient, AGENTS_TABLE, calculateVotingPower, response, QueryCommand } = require('./shared');

exports.handler = async (event) => {
    try {
        const name = event.pathParameters?.name;
        
        if (!name) {
            return response(400, {
                success: false,
                error: 'Agent name is required'
            });
        }
        
        // Query by name index
        const result = await docClient.send(new QueryCommand({
            TableName: AGENTS_TABLE,
            IndexName: 'name-index',
            KeyConditionExpression: '#name = :name',
            ExpressionAttributeNames: { '#name': 'name' },
            ExpressionAttributeValues: { ':name': name.toLowerCase() }
        }));
        
        if (!result.Items || result.Items.length === 0) {
            return response(404, {
                success: false,
                error: 'Agent not found'
            });
        }
        
        const agent = result.Items[0];
        
        // Calculate voting power
        const votingPower = calculateVotingPower(agent.tokensAllocated, agent.reputation);
        
        // Return public info (exclude token)
        const { token, ...publicInfo } = agent;
        
        return response(200, {
            success: true,
            agent: {
                ...publicInfo,
                votingPower: Math.round(votingPower * 100) / 100
            }
        });
        
    } catch (error) {
        console.error('GetAgent error:', error);
        return response(500, {
            success: false,
            error: 'Failed to get agent'
        });
    }
};
