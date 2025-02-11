const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { encoding_for_model } = require('tiktoken');
require('dotenv').config();
const axios = require('axios'); // Import axios

const app = express();
const PORT = process.env.PORT || 3001; 
const SLACK_URL = process.env.SLACK_WEBHOOK_URL;

// Middleware for CORS
app.use(cors());

// Middleware to parse JSON
// app.use(bodyParser.json());
app.use(bodyParser.json({ limit: '50mb' })); // Adjust the limit as needed
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// GPT Model Pricing
const MODEL_PRICING = {
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.150, output: 0.600 },
};

// Add these constants at the top with other constants
const MAX_CHUNK_SIZE = 100;
const DEFAULT_MODEL = "gpt-4o";

// Token Calculator API
app.post('/calculate', (req, res) => {
  try {
    console.log('Request received for /calculate');
    const { qaPairs, outputTokens, agents } = req.body;

    // Validate input
    if (!qaPairs || !agents) {
      return res.status(400).json({ error: 'Invalid input. All fields are required.' });
    }

    // Initialize counters
    let totalTokens = 0;
    let totalOutputTokens = 0;
    let countTotalEvaluation = 0;
    let totalCost = 0;

    // Pre-compute agent-specific static content with their individual models
    const agentStaticTokens = agents.map(agent => {
      const model = agent.model || DEFAULT_MODEL;
      const encoding = encoding_for_model(model);
      const total_SGR_text = agent.sample_good_response.join(" ");
      const total_SBR_text = agent.sample_bad_response.join(" ");
      const staticText = `${agent.prompt} ${total_SBR_text} ${total_SGR_text}`;
      return {
        staticTokenCount: encoding.encode(staticText).length,
        model,
        encoding,
        agent
      };
    });

    // Process in chunks
    for (let i = 0; i < qaPairs.length; i += MAX_CHUNK_SIZE) {
      const chunk = qaPairs.slice(i, i + MAX_CHUNK_SIZE);
      
      // Calculate tokens for each agent-qa combination
      agentStaticTokens.forEach(({ staticTokenCount, model, encoding, agent }) => {
        chunk.forEach(({ question, answer }) => {
          const qaText = `${question} ${answer}`;
          const qaTokenCount = encoding.encode(qaText).length;
          const promptTokens = qaTokenCount + staticTokenCount;
          
          totalTokens += promptTokens;
          totalOutputTokens += outputTokens;
          countTotalEvaluation++;

          // Calculate cost using agent-specific model pricing
          const inputTokenCost = ((promptTokens/1000000) * MODEL_PRICING[model].input);
          const outputTokenCost = ((outputTokens/1000000) * MODEL_PRICING[model].output);
          totalCost += (inputTokenCost + outputTokenCost);
        });
      });
    }

    // Response
    res.json({
      totalTokens,
      totalOutputTokens,
      countTotalEvaluation,
      totalCost: totalCost.toFixed(4),
    });
  } catch (error) {
    console.error('Error calculating tokens:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
