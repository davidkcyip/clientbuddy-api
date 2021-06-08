'use strict';

/**
 * Read the documentation (https://strapi.io/documentation/developer-docs/latest/development/backend-customization.html#core-controllers)
 * to customize this controller
 */
const _ = require('lodash');
const { sanitizeEntity } = require('strapi-utils');

module.exports = {
    async findOne(ctx) {
        const { id } = ctx.params;
        const user = ctx.state.user;

        if (!user) {
            return ctx.badRequest(
                null,
                'You are not logged in'
            );
        }

        const company = await strapi.services.company.findOne({ id: user.company });

        const userSites = company.sites.map(site => site.id);

        const site = await strapi.services.site.findOne({ id });

        if ( ! userSites.includes(site.id) ) {
            return ctx.badRequest(
                null,
                'Not Allowed'
            );
        }

        const issues = await strapi.services.issue.find({ 'site.id': id });

        return {
            ...sanitizeEntity(site, { model: strapi.models.site }),
            issues: issues.map(issue => {
                return sanitizeEntity(issue, { model: strapi.models.issue });
            })
        }
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

        const companies = await strapi.services.company.find({ 'users.id': user.id });

        const thisSite = companies.find(company => company.sites.find(site => parseInt(id) === parseInt(site.id)));

        if (!thisSite) {
            return ctx.badRequest(
                null,
                'Not allowed'
            );
        }

        const site = await strapi.services.site.update({ id }, ctx.request.body);

        return sanitizeEntity(site, { model: strapi.models.site });
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

        const companies = await strapi.services.company.find({ 'users.id': user.id });

        const thisSite = companies.find(company => company.sites.find(site => parseInt(id) === parseInt(site.id)));

        if (!thisSite) {
            return ctx.badRequest(
                null,
                'Not allowed'
            );
        }

        const site = await strapi.services.site.delete({ id }, ctx.request.body);

        return sanitizeEntity(site, { model: strapi.models.site });
    },
};
