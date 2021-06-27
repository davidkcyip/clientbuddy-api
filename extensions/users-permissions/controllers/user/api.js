'use strict';

/**
 * Read the documentation (https://strapi.io/documentation/developer-docs/latest/development/backend-customization.html#core-controllers)
 * to customize this controller
 */
const _ = require('lodash');
const { sanitizeEntity } = require('strapi-utils');
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const sanitizeUser = user =>
  sanitizeEntity(user, {
    model: strapi.query('user', 'users-permissions').model,
  });

const formatError = error => [
  { messages: [{ id: error.id, message: error.message, field: error.field }] },
];

module.exports = {
    /**
     * Create a/an user record.
     * @return {Object}
     */
    async create(ctx) {
        const loggedInUser = ctx.state.user;
        const advanced = await strapi
        .store({
            environment: '',
            type: 'plugin',
            name: 'users-permissions',
            key: 'advanced',
        })
        .get();

        const { email, username, password, role } = ctx.request.body;

        if (!email) return ctx.badRequest('missing.email');
        if (!username) return ctx.badRequest('missing.username');
        if (!password) return ctx.badRequest('missing.password');

        const userWithSameUsername = await strapi
        .query('user', 'users-permissions')
        .findOne({ username });

        if (userWithSameUsername) {
            return ctx.badRequest(
                null,
                formatError({
                id: 'Auth.form.error.username.taken',
                message: 'Username already taken.',
                field: ['username'],
                })
            );
        }

        if (advanced.unique_email) {
        const userWithSameEmail = await strapi
            .query('user', 'users-permissions')
            .findOne({ email: email.toLowerCase() });

        if (userWithSameEmail) {
            return ctx.badRequest(
            null,

            formatError({
                id: 'Auth.form.error.email.taken',
                message: 'Email already taken.',
                field: ['email'],
            })
            );
        }
        }

        const user = {
        ...ctx.request.body,
        provider: 'local',
        };

        user.email = user.email.toLowerCase();

        if (!role) {
            const defaultRole = await strapi
                .query('role', 'users-permissions')
                .findOne({ type: advanced.default_role }, []);

            user.role = defaultRole.id;
        }

        try {
            const data = await strapi.plugins['users-permissions'].services.user.add(user);

            // email user
            const msg = {
                to: email,
                from: 'hello@clientbuddy.net',
                subject: `You have been invited to the ${loggedInUser.company.name} workspace on Client Buddy`,
                html: `
                    <div>Hi ${ctx.request.body.first_name}!</div>
                    <br />
                    <div>You have been invited to the ${loggedInUser.company.name} workspace on Client Buddy.</div>
                    <br />
                    <div>Please set-up your password <a href="https://clientbuddy.net/auth/set-up-password/${ctx.request.body.invitation_code}">here</a>.</div>
                    <br />
                    <div>Best Regards,</div>
                    <br />
                    <div>ClientBuddy</div>
                `,
            };
            sgMail.send(msg);

            ctx.created(sanitizeUser(data));
        } catch (error) {
            ctx.badRequest(null, formatError(error));
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

        if (parseInt(user.id) !== parseInt(id)) {
            return ctx.badRequest(
                null,
                'Not allowed'
            );
        }

        const updatedUser = await strapi.plugins['users-permissions'].services.user.edit({ id }, ctx.request.body);

        return sanitizeEntity(updatedUser, { model: strapi.query('user', 'users-permissions').model });
    },
};
