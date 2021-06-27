'use strict';

/**
 * Read the documentation (https://strapi.io/documentation/developer-docs/latest/development/backend-customization.html#core-controllers)
 * to customize this controller
 */
const _ = require('lodash');
const { sanitizeEntity } = require('strapi-utils');
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

module.exports = {
    async create(ctx) {
        const stateUser = ctx.state.user;
        const issue = await strapi.services.issue.findOne({ id: ctx.request.body.issue });
        const company = await strapi.services.company.findOne({ id: issue.site.company });

        if (!stateUser) {
            return ctx.badRequest(
                null,
                'You are not logged in'
            );
        }

        const newComment = await strapi.services.comment.create(ctx.request.body);

        // new find all users who have want to receive new report notifications
        const usersToNotify = company.users.filter(user => user.new_comment_notification);

        usersToNotify.forEach(user => {
            if (stateUser.id !== user.id) {
                const msg = {
                    to: user.email,
                    from: 'hello@clientbuddy.net',
                    replyTo: `issue.${issue ? issue.id : ''}@client-mail.clientbuddy.net`,
                    subject: `New comment posted on ${issue.title}`,
                    html: `
                        <div>Hi ${user.first_name}!</div>
                        <br />
                        <div>A new comment has been posted on ${issue.title} by ${stateUser.first_name} ${stateUser.last_name}:</div>
                        <br />
                        <div>${ctx.request.body.text}</div>
                        <br />
                        <div>To see this comment in its full context, please go to https://clientbuddy.net/admin/issues/${issue.id}</div>
                        <br />
                        <div>If you wish to reply to this comment, please reply to this email or through the dashboard.</div>
                        <br />
                        <div>Best Regards,</div>
                        <br />
                        <div>ClientBuddy</div>
                    `,
                };
                sgMail.send(msg);
            }
        });

        return sanitizeEntity(newComment, { model: strapi.models.comment });
    },

    async createThroughEmail(ctx) {
        let issueId = ctx.request.body.to && ctx.request.body.to.length ? ctx.request.body.to[0].email.split("@")[0] : null;
        
        if (issueId) {
            const siteSplit = issueId.split(".");

            if (siteSplit[0] === "issue") {
                issueId = siteSplit[1];
            } else {
                issueId = null;
            }
        }
        const emailUser = await strapi.query('user', 'users-permissions').findOne({ email: ctx.request.body.from.email });
        const issue = await strapi.services.issue.findOne({ id: issueId });
        const company = await strapi.services.company.findOne({ id: issue.site.company });

        if (!emailUser) {
            return ctx.badRequest(
                null,
                'You are not allowed'
            );
        }

        const newComment = await strapi.services.comment.create({
            text: ctx.request.body.text,
            user: emailUser ? emailUser.id : null,
            issue: issue ? issue.id : null
        });

        // new find all users who have want to receive new report notifications
        const usersToNotify = company.users.filter(user => user.new_comment_notification);

        usersToNotify.forEach(user => {
            if (emailUser.id !== user.id) {
                const msg = {
                    to: user.email,
                    from: 'hello@clientbuddy.net',
                    replyTo: `issue.${issue ? issue.id : ''}@client-mail.clientbuddy.net`,
                    subject: `New comment posted on ${issue.title}`,
                    html: `
                        <div>Hi ${user.first_name}!</div>
                        <br />
                        <div>A new comment has been posted on ${issue.title} by ${ctx.request.body.from.name}:</div>
                        <br />
                        <div>${ctx.request.body.text}</div>
                        <br />
                        <div>To see this comment in its full context, please go to https://clientbuddy.net/admin/issues/${issue.id}</div>
                        <br />
                        <div>If you wish to reply to this comment, please reply to this email or through the dashboard.</div>
                        <br />
                        <div>Best Regards,</div>
                        <br />
                        <div>ClientBuddy</div>
                    `,
                };
                sgMail.send(msg);
            }
        });

        return sanitizeEntity(newComment, { model: strapi.models.comment });
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

        const thisComment = await strapi.services.comment.findOne({ id: id, 'user.id': user.id });

        if (!thisComment) {
            return ctx.badRequest(
                null,
                'Not allowed'
            );
        }

        const comment = await strapi.services.comment.update({ id }, ctx.request.body);

        return sanitizeEntity(comment, { model: strapi.models.comment });
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

        const thisComment = await strapi.services.comment.findOne({ id: id, 'user.id': user.id });

        if (!thisComment) {
            return ctx.badRequest(
                null,
                'Not allowed'
            );
        }

        const comment = await strapi.services.comment.delete({ id });

        return sanitizeEntity(comment, { model: strapi.models.comment });
    },
};
