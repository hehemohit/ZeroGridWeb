const express = require('express');
const verifyToken = require('../middleware/verifyToken');
const { getContacts, addContact, deleteContact } = require('../controllers/contactController');

const router = express.Router();

// All contacts endpoints require a valid JWT session
router.use(verifyToken);

router.get('/', getContacts);
router.post('/', addContact);
router.delete('/:id', deleteContact);

module.exports = router;
