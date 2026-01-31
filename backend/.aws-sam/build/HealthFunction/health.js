/**
 * Health Check Lambda
 */

exports.handler = async (event) => {
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
            status: 'ok',
            service: 'MoltDAO API',
            timestamp: new Date().toISOString(),
            version: '1.0.0'
        })
    };
};
