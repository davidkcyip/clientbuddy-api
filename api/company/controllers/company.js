'use strict';

/**
 * Read the documentation (https://strapi.io/documentation/developer-docs/latest/development/backend-customization.html#core-controllers)
 * to customize this controller
 */
const _ = require('lodash');
const { sanitizeEntity } = require('strapi-utils');

module.exports = {
    // GET /companies/me
	// fetch companies that belong to me
    async me(ctx) {
        const user = ctx.state.user;

        if (!user) {
            return ctx.badRequest(
                null,
                'You are not logged in'
            );
        }

        const companies = await strapi.services.company.find({ 'users.id': user.id });

        return companies.map(company => {
            return sanitizeEntity(company, { model: strapi.models.company })
        });
    },

    async update(ctx) {
        const { id } = ctx.params;
        const user = ctx.state.user;

        if (!user) {
            return ctx.badRequest(
                null,
                'You are not logged in'
            );
        }

        const thisCompany = await strapi.services.company.findOne({ id, 'users.id': user.id });

        if (!thisCompany) {
            return ctx.badRequest(
                null,
                'Not allowed'
            );
        }

        const company = await strapi.services.company.update({ id }, ctx.request.body);

        return sanitizeEntity(company, { model: strapi.models.company })
    },

    async delete(ctx) {
        const { id } = ctx.params;
        const user = ctx.state.user;

        if (!user) {
            return ctx.badRequest(
                null,
                'You are not logged in'
            );
        }

        const thisCompany = await strapi.services.company.findOne({ id, 'users.id': user.id });

        if (!thisCompany) {
            return ctx.badRequest(
                null,
                'Not allowed'
            );
        }

        const company = await strapi.services.company.delete({ id });

        return sanitizeEntity(company, { model: strapi.models.company })
    },
};
