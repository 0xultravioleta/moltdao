/**
 * Get DAO Status Lambda
 */

const { docClient, AGENTS_TABLE, TIERS, getTier, response, ScanCommand } = require('./shared');

exports.handler = async (event) => {
    try {
        // Get total agent count
        const scanResult = await docClient.send(new ScanCommand({
            TableName: AGENTS_TABLE,
            Select: 'COUNT'
        }));
        
        const totalAgents = scanResult.Count || 0;
        const nextPosition = totalAgents + 1;
        const currentTier = getTier(nextPosition);
        
        // Calculate tier status
        const tierStatus = TIERS.map(tier => {
            const filled = tier.max === Infinity 
                ? Math.max(0, totalAgents - tier.min + 1)
                : Math.min(totalAgents, tier.max) - tier.min + 1;
            
            return {
                name: tier.name,
                emoji: tier.emoji,
                tokens: tier.tokens,
                filled: Math.max(0, Math.min(filled, tier.max - tier.min + 1)),
                total: tier.max === Infinity ? '∞' : tier.max - tier.min + 1,
                isOpen: nextPosition >= tier.min && nextPosition <= tier.max,
                range: `${tier.min}-${tier.max === Infinity ? '∞' : tier.max}`
            };
        });
        
        return response(200, {
            success: true,
            totalAgents,
            nextPosition,
            currentTier: currentTier.name,
            currentTierEmoji: currentTier.emoji,
            tokensForNext: currentTier.tokens,
            genesisRemaining: Math.max(0, 89 - totalAgents),
            tiers: tierStatus
        });
        
    } catch (error) {
        console.error('Status error:', error);
        return response(500, {
            success: false,
            error: 'Failed to get DAO status'
        });
    }
};
