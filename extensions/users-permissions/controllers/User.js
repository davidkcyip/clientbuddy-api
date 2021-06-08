'use strict';

/**
 * Read the documentation (https://strapi.io/documentation/developer-docs/latest/development/backend-customization.html#core-controllers)
 * to customize this controller
 */
const _ = require('lodash');
const { sanitizeEntity } = require('strapi-utils');
const adminUserController = require('./user/admin');
const apiUserController = require('./user/api');

const resolveController = ctx => {
  const {
    state: { isAuthenticatedAdmin },
  } = ctx;

  return isAuthenticatedAdmin ? adminUserController : apiUserController;
};

const resolveControllerMethod = method => ctx => {
    const controller = resolveController(ctx);
    const callbackFn = controller[method];
  
    if (!_.isFunction(callbackFn)) {
      return ctx.notFound();
    }
  
    return callbackFn(ctx);
};

module.exports = {
    update: resolveControllerMethod('update'),

    // GET /users/me
	// fetch companies that belong to me
    async me(ctx) {
        const user = ctx.state.user;

        if (!user) {
            return ctx.badRequest(
                null,
                'You are not logged in'
            );
        }

        const company = await strapi.services.company.findOne({ 'users.id': user.id });
        const sites = await strapi.services.site.find({ 'company.id': company.id }, ['issues', 'issues.assigned_to', 'issues.site', 'issues.attachments']);

        return {
            ...sanitizeEntity(user, {
                model: strapi.query('user', 'users-permissions').model,
            }),
            company: {
                ...sanitizeEntity(company, { model: strapi.models.company }),
                sites: sites.map(site => {
                    return sanitizeEntity(site, { model: strapi.models.site });
                })
            }
        }
    },

    async destroy(ctx) {
        const { id } = ctx.params;
        const user = ctx.state.user;

        if (!user) {
            return ctx.badRequest(
                null,
                'You are not logged in'
            );
        }

        if (parseInt(user.id) !== parseInt(id)) {
            return ctx.badRequest(
                null,
                'Not allowed'
            );
        }

        const deleteUser = await strapi.plugins['users-permissions'].services.user.remove({ id });

        return sanitizeEntity(deleteUser, { model: strapi.query('user', 'users-permissions').model });
    },
};
