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

    const agentCount = agents.length;
    const qa_count = qaPairs.length;
    console.log("agentCount", agentCount);
    console.log("qa_count", qa_count);

    // Initialize counters
    let totalTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0;

    // Use a single encoding instance for all calculations
    const encoding = encoding_for_model(DEFAULT_MODEL);

    // 1. Calculate QA pairs tokens in one pass - O(n)
    const qaTokens = qaPairs.reduce((acc, { question, answer }) => {
      return acc + encoding.encode(`${question} ${answer}`).length;
    }, 0);

    // 2. Calculate static tokens for each agent in one pass - O(m)
    const agentStaticTokens = agents.map(agent => {
      const model = agent.model || DEFAULT_MODEL;
      const staticText = `${agent.prompt} ${agent.sample_bad_response.join(" ")} ${agent.sample_good_response.join(" ")}`;
      return {
        tokens: encoding.encode(staticText).length,
        model
      };
    });

    // 3. Calculate final totals in one pass - O(m)
    const totalStaticTokens = agentStaticTokens.reduce((acc, { tokens, model }) => {
      // Calculate per agent
      const agentTotalTokens = qaTokens + (tokens * qa_count);
      const agentOutputTokens = outputTokens * qa_count;
      
      // Add to totals
      totalTokens += agentTotalTokens;
      totalOutputTokens += agentOutputTokens;

      // Calculate cost
      const inputTokenCost = (agentTotalTokens/1000000) * MODEL_PRICING[model].input;
      const outputTokenCost = (agentOutputTokens/1000000) * MODEL_PRICING[model].output;
      totalCost += (inputTokenCost + outputTokenCost);

      return acc + tokens;
    }, 0);

    console.log("totalTokens", totalTokens);
    console.log("totalOutputTokens", totalOutputTokens);
    console.log("countTotalEvaluation", agentCount * qa_count);
    console.log("totalCost", totalCost.toFixed(4));

    // Response
    res.json({
      totalTokens,
      totalOutputTokens,
      countTotalEvaluation: agentCount * qa_count,
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
