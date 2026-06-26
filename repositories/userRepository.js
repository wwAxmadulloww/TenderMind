'use strict';

const { User } = require('../models');

const findByPhone = (phone) => User.findOne({ phone });
const findById = (id) => User.findOne({ id });
const create = (data) => User.create(data);

module.exports = { findByPhone, findById, create };
