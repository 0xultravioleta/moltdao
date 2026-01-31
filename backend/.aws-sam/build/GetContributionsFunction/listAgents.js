/**
 * List Agents Lambda
 */

const { docClient, AGENTS_TABLE, response, ScanCommand } = require('./shared');

exports.handler = async (event) => {
    try {
        const queryParams = event.queryStringParameters || {};
        const limit = Math.min(parseInt(queryParams.limit) || 50, 100);
        const tier = queryParams.tier;
        
        // Build scan parameters
        const scanParams = {
            TableName: AGENTS_TABLE,
            Limit: limit
        };
        
        // Filter by tier if specified
        if (tier) {
            scanParams.FilterExpression = '#tier = :tier';
            scanParams.ExpressionAttributeNames = { '#tier': 'tier' };
            scanParams.ExpressionAttributeValues = { ':tier': tier };
        }
        
        // Handle pagination
        if (queryParams.lastKey) {
            try {
                scanParams.ExclusiveStartKey = JSON.parse(
                    Buffer.from(queryParams.lastKey, 'base64').toString()
                );
            } catch (e) {
                // Invalid lastKey, ignore
            }
        }
        
        const result = await docClient.send(new ScanCommand(scanParams));
        
        // Remove tokens from response
        const agents = (result.Items || []).map(agent => {
            const { token, ...publicInfo } = agent;
            return publicInfo;
        });
        
        // Sort by position
        agents.sort((a, b) => a.position - b.position);
        
        // Prepare pagination cursor
        let nextKey = null;
        if (result.LastEvaluatedKey) {
            nextKey = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
        }
        
        return response(200, {
            success: true,
            agents,
            total: result.Count,
            hasMore: !!result.LastEvaluatedKey,
            nextKey
        });
        
    } catch (error) {
        console.error('ListAgents error:', error);
        return response(500, {
            success: false,
            error: 'Failed to list agents'
        });
    }
};
