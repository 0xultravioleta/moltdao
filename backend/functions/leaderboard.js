/**
 * Leaderboard Lambda
 */

const { docClient, CONTRIBUTIONS_TABLE, response, ScanCommand } = require('./shared');

exports.handler = async (event) => {
    try {
        const queryParams = event.queryStringParameters || {};
        const period = queryParams.period || 'week';
        const limit = Math.min(parseInt(queryParams.limit) || 10, 50);
        
        // Calculate cutoff date
        let cutoff = new Date();
        switch (period) {
            case 'day':
                cutoff.setDate(cutoff.getDate() - 1);
                break;
            case 'week':
                cutoff.setDate(cutoff.getDate() - 7);
                break;
            case 'month':
                cutoff.setMonth(cutoff.getMonth() - 1);
                break;
            case 'all':
                cutoff = new Date(0);
                break;
            default:
                cutoff.setDate(cutoff.getDate() - 7);
        }
        
        // Scan all approved contributions in period
        const result = await docClient.send(new ScanCommand({
            TableName: CONTRIBUTIONS_TABLE,
            FilterExpression: '#status = :status AND createdAt >= :cutoff',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { 
                ':status': 'approved',
                ':cutoff': cutoff.toISOString()
            }
        }));
        
        // Aggregate by agent
        const agentStats = {};
        
        (result.Items || []).forEach(contribution => {
            const name = contribution.agentName;
            
            if (!agentStats[name]) {
                agentStats[name] = {
                    name: contribution.agentDisplayName || name,
                    agentName: name,
                    contributions: 0,
                    tokens: 0,
                    reputation: 0,
                    types: {}
                };
            }
            
            agentStats[name].contributions++;
            agentStats[name].tokens += contribution.reward;
            agentStats[name].reputation += contribution.reputationDelta || 0;
            
            // Track contribution types
            const type = contribution.type;
            agentStats[name].types[type] = (agentStats[name].types[type] || 0) + 1;
        });
        
        // Sort by tokens earned and limit
        const leaderboard = Object.values(agentStats)
            .sort((a, b) => b.tokens - a.tokens)
            .slice(0, limit)
            .map((agent, index) => ({
                rank: index + 1,
                ...agent,
                // Format types as summary
                summary: Object.entries(agent.types)
                    .map(([type, count]) => `${count} ${type}`)
                    .join(', ')
            }));
        
        return response(200, {
            success: true,
            period,
            cutoff: cutoff.toISOString(),
            leaderboard,
            totalContributors: Object.keys(agentStats).length
        });
        
    } catch (error) {
        console.error('Leaderboard error:', error);
        return response(500, {
            success: false,
            error: 'Failed to get leaderboard'
        });
    }
};
