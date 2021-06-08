'use strict';

/**
 * Read the documentation (https://strapi.io/documentation/developer-docs/latest/development/backend-customization.html#core-controllers)
 * to customize this controller
 */
const request = require('request');
const fs = require('fs');
const _ = require('lodash');
const { sanitizeEntity } = require('strapi-utils');
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

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

        const issue = await strapi.services.issue.findOne({ id });

        const company = await strapi.services.company.findOne({ id: user.company });

        const userSites = company.sites.map(site => site.id);

        if ( ! userSites.includes(issue.site.id) ) {
            return ctx.badRequest(
                null,
                'Not Allowed'
            );
        }

        const comments = await strapi.services.comment.find({ 'issue.id': issue.id });

        return {
            ...sanitizeEntity(issue, { model: strapi.models.issue }),
            comments: comments.map(comment => {
                return sanitizeEntity(comment, { model: strapi.models.comment });
            })
        }
    },

    async create(ctx) {
        const site = await strapi.services.site.findOne({ id: ctx.request.body.site });
        const company = await strapi.services.company.findOne({ id: site.company.id });

        const { subscription } = company;
        
        if ( site.archived || ! ctx.request.header.origin.includes(site.url) || !subscription || !subscription.active ) {
            return ctx.badRequest(
                null,
                'Not Allowed'
            );
        }

        const newIssue = await strapi.services.issue.create(ctx.request.body);

        // new find all users who have want to receive new report notifications
        const usersToNotify = company.users.filter(user => user.new_report_notification);

        usersToNotify.forEach(user => {
            const msg = {
				to: user.email,
				from: 'hello@clientbuddy.net',
				subject: `New ClientBuddy issue reported`,
				html: `
					<div>Hi ${user.first_name}!</div>
					<br />
					<div>A new issue has been reported on ${ctx.request.body.url} with the following details:</div>
                    <br />
                    <div>Reported by: ${ctx.request.body.reported_by}</div>
                    <br />
					<div>Title: ${ctx.request.body.title}</div>
                    <br />
                    <div>Description: ${ctx.request.body.description}</div>
                    <br />
                    <div>To see this report in full detail, please go to https://app.clientbuddy.net/admin/issues/${newIssue.id}</div>
					<br />
					<div>Best Regards,</div>
					<br />
					<div>ClientBuddy</div>
				`,
            };
            sgMail.send(msg);
        });

        return sanitizeEntity(newIssue, { model: strapi.models.issue });
    },

    async update(ctx) {
        const { id } = ctx.params;
        const stateUser = ctx.state.user;
        const issue = await strapi.services.issue.findOne({ id });

        const assignedNotificationChanged = (!issue.assigned_to && ctx.request.body.assigned_to) || (issue.assigned_to && issue.assigned_to.id !== ctx.request.body.assigned_to);

        if (!stateUser) {
            return ctx.badRequest(
                null,
                'You are not logged in'
            );
        }

        const updatedIssue = await strapi.services.issue.update({ id }, ctx.request.body);

        if ( assignedNotificationChanged && ctx.request.body.assigned_to ) {
            // new find all users who have want to receive new report notifications
            const userToNotify = await strapi
                .query('user', 'users-permissions')
                .findOne({ id: ctx.request.body.assigned_to });

            if (stateUser.id !== userToNotify.id && userToNotify.assigned_notification) {
                const msg = {
                    to: userToNotify.email,
                    from: 'hello@clientbuddy.net',
                    subject: `A report has been assigned to you on ClientBuddy`,
                    html: `
                        <div>Hi ${userToNotify.first_name}!</div>
                        <br />
                        <div>${stateUser.first_name} ${stateUser.last_name} has assigned this issue to you:</div>
                        <h2>${issue.title}</h2>
                        <div>${issue.description}</div>
                        <br />
                        <div>To see this report in full detail, please go to https://app.clientbuddy.net/admin/issues/${updatedIssue.id}</div>
                        <br />
                        <div>Best Regards,</div>
                        <br />
                        <div>ClientBuddy</div>
                    `,
                };
                sgMail.send(msg);
            }
        }

        return sanitizeEntity(updatedIssue, { model: strapi.models.issue });
    },

    async delete(ctx) {
        const { id } = ctx.params;
        const siteThatThisIssueBelongsTo = await strapi.services.site.findOne({ 'issues.id': id });
        const user = ctx.state.user;
        const company = await strapi.services.company.findOne({ id: user.company });

        if (!user || company.id !== siteThatThisIssueBelongsTo.company.id) {
            return ctx.badRequest(
                null,
                'You are not logged in'
            );
        }

        const deletedIssue = await strapi.services.issue.delete({ id });

        return sanitizeEntity(deletedIssue, { model: strapi.models.issue });
    },

    async addAttachmentToJira(ctx) {
        const { id } = ctx.params;
        const {
            email,
            API_URL,
            api_token,
        } = ctx.request.body;
        const user = ctx.state.user;

        const issue = await strapi.services.issue.findOne({ id });

        const attachments = issue.attachments;

        if (attachments.length) {
            const formData = {
                file: {
                    value: fs.createReadStream(`public/${attachments[0].url}`),
                    options: {
                        filename: attachments[0].name,
                        contentType: 'video/mp4'
                    }
                }
            };

            request.post({url:API_URL, formData: formData, headers: { "X-Atlassian-Token": "no-check", 'Accept': 'application/json', 'Authorization': `Basic ${Buffer.from(
                `${email}:${api_token}`
            ).toString('base64')}` }  }, 
                function cb(err, httpResponse, body) {
                    if (err) {
                        return console.error('upload failed:', err);
                    }
                }
            );
        } else {
            if (!user) {
                return ctx.badRequest(
                    null,
                    'No attachments'
                );
            }
        }

        return {
            status: 'done'
        };
    },
};
