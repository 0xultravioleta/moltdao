/**
 * x402 Protocol Integration
 * HTTP-native payments via Ultravioleta DAO Facilitator
 */

const FACILITATOR_URL = 'https://facilitator.ultravioletadao.xyz';

// Supported chains (21 total)
const SUPPORTED_CHAINS = [
    'avalanche', 'base', 'polygon', 'ethereum', 'arbitrum',
    'optimism', 'bsc', 'fantom', 'gnosis', 'celo',
    'moonbeam', 'moonriver', 'aurora', 'harmony', 'cronos',
    'metis', 'boba', 'evmos', 'kava', 'linea', 'scroll'
];

/**
 * Make a request to the facilitator
 */
async function facilitatorRequest(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        }
    };
    
    if (body) {
        options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${FACILITATOR_URL}${endpoint}`, options);
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Facilitator error: ${error}`);
    }
    
    return response.json();
}

/**
 * Get facilitator status
 */
async function getStatus() {
    return facilitatorRequest('/status');
}

/**
 * Get supported chains
 */
async function getChains() {
    try {
        return await facilitatorRequest('/chains');
    } catch {
        // Fallback to hardcoded list
        return { chains: SUPPORTED_CHAINS };
    }
}

/**
 * Make a payment from one wallet to another
 * @param {Object} params
 * @param {string} params.from - Sender wallet address
 * @param {string} params.to - Recipient wallet address
 * @param {string} params.amount - Amount in token units
 * @param {string} params.asset - Token symbol (default: USDC)
 * @param {string} params.chain - Chain name (default: base)
 */
async function pay({ from, to, amount, asset = 'USDC', chain = 'base' }) {
    if (!SUPPORTED_CHAINS.includes(chain.toLowerCase())) {
        throw new Error(`Chain ${chain} not supported. Use one of: ${SUPPORTED_CHAINS.join(', ')}`);
    }
    
    return facilitatorRequest('/pay', 'POST', {
        from,
        to,
        amount,
        asset,
        chain
    });
}

/**
 * Start a streaming payment (via Superfluid)
 * @param {Object} params
 * @param {string} params.sender - Sender wallet address
 * @param {string} params.receiver - Recipient wallet address
 * @param {string} params.flowRate - Tokens per second (wei)
 * @param {string} params.token - Super token address (e.g., USDCx)
 */
async function startStream({ sender, receiver, flowRate, token = 'USDCx' }) {
    return facilitatorRequest('/stream', 'POST', {
        sender,
        receiver,
        token,
        flowRate
    });
}

/**
 * Stop a streaming payment
 */
async function stopStream({ sender, receiver, token = 'USDCx' }) {
    return facilitatorRequest('/stream/stop', 'POST', {
        sender,
        receiver,
        token
    });
}

/**
 * Get balance for a wallet
 */
async function getBalance(address, { chain = 'base', asset = 'USDC' } = {}) {
    return facilitatorRequest(`/balance/${address}?chain=${chain}&asset=${asset}`);
}

/**
 * Get transaction history for a wallet
 */
async function getHistory(address, { chain = 'base', limit = 50 } = {}) {
    return facilitatorRequest(`/history/${address}?chain=${chain}&limit=${limit}`);
}

/**
 * Verify a payment was made
 */
async function verifyPayment(txHash, { chain = 'base' } = {}) {
    return facilitatorRequest(`/verify/${txHash}?chain=${chain}`);
}

/**
 * Calculate contribution reward payment
 * Based on MoltDAO meritocracy system
 */
function calculateReward(contributionType, metadata = {}) {
    const REWARDS = {
        compute: 10,      // per hour
        pr: 50,           // base, can be higher
        research: 100,    // base
        vote: 10,         // per vote
        referral: 100,    // per agent
        outreach: 5       // base
    };
    
    let reward = REWARDS[contributionType] || 0;
    
    // Multipliers based on metadata
    if (contributionType === 'pr' && metadata.linesChanged > 500) {
        reward = 200; // Large PR
    } else if (contributionType === 'pr' && metadata.linesChanged > 100) {
        reward = 100; // Medium PR
    }
    
    if (contributionType === 'research' && metadata.isPeerReviewed) {
        reward = 500; // Peer-reviewed research
    }
    
    if (contributionType === 'outreach' && metadata.engagement > 100) {
        reward = 50; // High engagement post
    }
    
    return reward;
}

/**
 * Process a contribution payment
 */
async function payContribution({ agent, contributionType, metadata, treasuryWallet }) {
    const reward = calculateReward(contributionType, metadata);
    
    if (reward === 0) {
        return { success: false, error: 'No reward for this contribution type' };
    }
    
    if (!agent.wallet) {
        return { success: false, error: 'Agent has no wallet configured' };
    }
    
    try {
        const payment = await pay({
            from: treasuryWallet,
            to: agent.wallet,
            amount: reward.toString(),
            asset: 'MOLT', // or USDC for now
            chain: 'base'
        });
        
        return {
            success: true,
            reward,
            payment
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = {
    getStatus,
    getChains,
    pay,
    startStream,
    stopStream,
    getBalance,
    getHistory,
    verifyPayment,
    calculateReward,
    payContribution,
    SUPPORTED_CHAINS,
    FACILITATOR_URL
};
