/**
 * Get Contributions Lambda
 */

const { docClient, CONTRIBUTIONS_TABLE, response, ScanCommand, QueryCommand } = require('./shared');

exports.handler = async (event) => {
    try {
        const pathParams = event.pathParameters || {};
        const queryParams = event.queryStringParameters || {};
        
        const limit = Math.min(parseInt(queryParams.limit) || 50, 100);
        const status = queryParams.status;
        const type = queryParams.type;
        
        // If agent name in path, get contributions for that agent
        if (pathParams.name) {
            const result = await docClient.send(new QueryCommand({
                TableName: CONTRIBUTIONS_TABLE,
                IndexName: 'agent-index',
                KeyConditionExpression: 'agentName = :agentName',
                ExpressionAttributeValues: { ':agentName': pathParams.name.toLowerCase() },
                Limit: limit,
                ScanIndexForward: false // newest first
            }));
            
            const contributions = result.Items || [];
            
            // Calculate stats
            const approved = contributions.filter(c => c.status === 'approved');
            const stats = {
                total: contributions.length,
                approved: approved.length,
                pending: contributions.filter(c => c.status === 'pending').length,
                rejected: contributions.filter(c => c.status === 'rejected').length,
                totalReward: approved.reduce((sum, c) => sum + c.reward, 0),
                totalReputation: approved.reduce((sum, c) => sum + (c.reputationDelta || 0), 0)
            };
            
            return response(200, {
                success: true,
                agentName: pathParams.name,
                contributions,
                stats
            });
        }
        
        // Otherwise, get all contributions with optional filters
        let filterExpressions = [];
        let expressionValues = {};
        let expressionNames = {};
        
        if (status) {
            filterExpressions.push('#status = :status');
            expressionNames['#status'] = 'status';
            expressionValues[':status'] = status;
        }
        
        if (type) {
            filterExpressions.push('#type = :type');
            expressionNames['#type'] = 'type';
            expressionValues[':type'] = type;
        }
        
        const scanParams = {
            TableName: CONTRIBUTIONS_TABLE,
            Limit: limit
        };
        
        if (filterExpressions.length > 0) {
            scanParams.FilterExpression = filterExpressions.join(' AND ');
            scanParams.ExpressionAttributeNames = expressionNames;
            scanParams.ExpressionAttributeValues = expressionValues;
        }
        
        const result = await docClient.send(new ScanCommand(scanParams));
        
        // Sort by createdAt desc
        const contributions = (result.Items || []).sort(
            (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        );
        
        // Calculate overall stats
        const approved = contributions.filter(c => c.status === 'approved');
        const stats = {
            total: contributions.length,
            approved: approved.length,
            pending: contributions.filter(c => c.status === 'pending').length,
            tokensDistributed: approved.reduce((sum, c) => sum + c.reward, 0)
        };
        
        return response(200, {
            success: true,
            contributions,
            stats,
            hasMore: !!result.LastEvaluatedKey
        });
        
    } catch (error) {
        console.error('GetContributions error:', error);
        return response(500, {
            success: false,
            error: 'Failed to get contributions'
        });
    }
};
