'use strict';

/**
 * Auth.js controller
 *
 * @description: A set of functions called "actions" for managing `Auth`.
 */

/* eslint-disable no-useless-escape */
const crypto = require('crypto');
const _ = require('lodash');
const grant = require('grant-koa');
const { sanitizeEntity } = require('strapi-utils');
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const emailRegExp = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
const formatError = error => [
{ messages: [{ id: error.id, message: error.message, field: error.field }] },
];

module.exports = {
	async callback(ctx) {
		const provider = ctx.params.provider || 'local';
		const params = ctx.request.body;

		const store = await strapi.store({
		environment: '',
		type: 'plugin',
		name: 'users-permissions',
		});

		if (provider === 'local') {
		if (!_.get(await store.get({ key: 'grant' }), 'email.enabled')) {
			return ctx.badRequest(null, 'This provider is disabled.');
		}

		// The identifier is required.
		if (!params.identifier) {
			return ctx.badRequest(
			null,
			formatError({
				id: 'Auth.form.error.email.provide',
				message: 'Please provide your username or your e-mail.',
			})
			);
		}

		// The password is required.
		if (!params.password) {
			return ctx.badRequest(
			null,
			formatError({
				id: 'Auth.form.error.password.provide',
				message: 'Please provide your password.',
			})
			);
		}

		const query = { provider };

		// Check if the provided identifier is an email or not.
		const isEmail = emailRegExp.test(params.identifier);

		// Set the identifier to the appropriate query field.
		if (isEmail) {
			query.email = params.identifier.toLowerCase();
		} else {
			query.username = params.identifier;
		}

		// Check if the user exists.
		const user = await strapi.query('user', 'users-permissions').findOne(query);

		if (!user) {
			return ctx.badRequest(
			null,
			formatError({
				id: 'Auth.form.error.invalid',
				message: 'Identifier or password invalid.',
			})
			);
		}

		if (
			_.get(await store.get({ key: 'advanced' }), 'email_confirmation') &&
			user.confirmed !== true
		) {
			return ctx.badRequest(
			null,
			formatError({
				id: 'Auth.form.error.confirmed',
				message: 'Your account email is not confirmed',
			})
			);
		}

		if (user.blocked === true) {
			return ctx.badRequest(
			null,
			formatError({
				id: 'Auth.form.error.blocked',
				message: 'Your account has been blocked by an administrator',
			})
			);
		}

		// The user never authenticated with the `local` provider.
		if (!user.password) {
			return ctx.badRequest(
			null,
			formatError({
				id: 'Auth.form.error.password.local',
				message:
				'This user never set a local password, please login with the provider used during account creation.',
			})
			);
		}

		const validPassword = await strapi.plugins[
			'users-permissions'
		].services.user.validatePassword(params.password, user.password);

		if (!validPassword) {
			return ctx.badRequest(
			null,
			formatError({
				id: 'Auth.form.error.invalid',
				message: 'Identifier or password invalid.',
			})
			);
		} else {
			ctx.send({
			jwt: strapi.plugins['users-permissions'].services.jwt.issue({
				id: user.id,
			}),
			user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
				model: strapi.query('user', 'users-permissions').model,
			}),
			});
		}
		} else {
		if (!_.get(await store.get({ key: 'grant' }), [provider, 'enabled'])) {
			return ctx.badRequest(
			null,
			formatError({
				id: 'provider.disabled',
				message: 'This provider is disabled.',
			})
			);
		}

		// Connect the user with the third-party provider.
		let user, error;
		try {
			[user, error] = await strapi.plugins['users-permissions'].services.providers.connect(
			provider,
			ctx.query
			);
		} catch ([user, error]) {
			return ctx.badRequest(null, error === 'array' ? error[0] : error);
		}

		if (!user) {
			return ctx.badRequest(null, error === 'array' ? error[0] : error);
		}

		ctx.send({
			jwt: strapi.plugins['users-permissions'].services.jwt.issue({
			id: user.id,
			}),
			user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
			model: strapi.query('user', 'users-permissions').model,
			}),
		});
		}
	},

	async resetPassword(ctx) {
		const params = _.assign({}, ctx.request.body, ctx.params);

		if (
		params.password &&
		params.passwordConfirmation &&
		params.password === params.passwordConfirmation &&
		params.code
		) {
		const user = await strapi
			.query('user', 'users-permissions')
			.findOne({ resetPasswordToken: `${params.code}` });

		if (!user) {
			return ctx.badRequest(
			null,
			formatError({
				id: 'Auth.form.error.code.provide',
				message: 'Incorrect code provided.',
			})
			);
		}

		const password = await strapi.plugins['users-permissions'].services.user.hashPassword({
			password: params.password,
		});

		// Update the user.
		await strapi
			.query('user', 'users-permissions')
			.update({ id: user.id }, { resetPasswordToken: null, password });

		ctx.send({
			jwt: strapi.plugins['users-permissions'].services.jwt.issue({
			id: user.id,
			}),
			user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
			model: strapi.query('user', 'users-permissions').model,
			}),
		});
		} else if (
		params.password &&
		params.passwordConfirmation &&
		params.password !== params.passwordConfirmation
		) {
		return ctx.badRequest(
			null,
			formatError({
			id: 'Auth.form.error.password.matching',
			message: 'Passwords do not match.',
			})
		);
		} else {
		return ctx.badRequest(
			null,
			formatError({
			id: 'Auth.form.error.params.provide',
			message: 'Incorrect params provided.',
			})
		);
		}
	},

	async connect(ctx, next) {
		const grantConfig = await strapi
		.store({
			environment: '',
			type: 'plugin',
			name: 'users-permissions',
			key: 'grant',
		})
		.get();

		const [requestPath] = ctx.request.url.split('?');
		const provider = requestPath.split('/')[2];

		if (!_.get(grantConfig[provider], 'enabled')) {
		return ctx.badRequest(null, 'This provider is disabled.');
		}

		if (!strapi.config.server.url.startsWith('http')) {
		strapi.log.warn(
			'You are using a third party provider for login. Make sure to set an absolute url in config/server.js. More info here: https://strapi.io/documentation/developer-docs/latest/development/plugins/users-permissions.html#setting-up-the-server-url'
		);
		}

		// Ability to pass OAuth callback dynamically
		grantConfig[provider].callback = _.get(ctx, 'query.callback') || grantConfig[provider].callback;
		grantConfig[provider].redirect_uri = strapi.plugins[
		'users-permissions'
		].services.providers.buildRedirectUri(provider);

		return grant(grantConfig)(ctx, next);
	},

	async forgotPassword(ctx) {
		let { email } = ctx.request.body;

		console.log(email);

		// Check if the provided email is valid or not.
		const isEmail = emailRegExp.test(email);

		if (isEmail) {
			email = email.toLowerCase();
		} else {
		return ctx.badRequest(
			null,
			formatError({
			id: 'Auth.form.error.email.format',
			message: 'Please provide valid email address.',
			})
		);
		}

		const pluginStore = await strapi.store({
		environment: '',
		type: 'plugin',
		name: 'users-permissions',
		});

		// Find the user by email.
		const user = await strapi
		.query('user', 'users-permissions')
		.findOne({ email: email.toLowerCase() });

		// User not found.
		if (!user) {
			return ctx.badRequest(
				null,
				formatError({
				id: 'Auth.form.error.user.not-exist',
				message: 'This email does not exist.',
				})
			);
		}

		// Generate random token.
		const resetPasswordToken = crypto.randomBytes(64).toString('hex');

		try {
			const msg = {
				to: user.email,
				from: 'hello@clientbuddy.net',
				subject: `Reset Password for your ClientBuddy account`,
				html: `
					<div>Hi ${user.first_name},</div>
					<br />
					<div>You are receiving this email because you have requested to reset your password. You can do so by following the link below:</div>
					<br />
					<div>https://app.clientbuddy.net/auth/reset-password/${resetPasswordToken}</div>
					<br />
					<div>Best Regards,</div>
					<br />
					<div>ClientBuddy</div>
				`,
			};
			sgMail.send(msg);
		} catch (err) {
			return ctx.badRequest(null, err);
		}

		// Update the user.
		await strapi.query('user', 'users-permissions').update({ id: user.id }, { resetPasswordToken });

		ctx.send({ ok: true });
	},

	async register(ctx) {
		const pluginStore = await strapi.store({
			environment: '',
			type: 'plugin',
			name: 'users-permissions',
		});

		const settings = await pluginStore.get({
			key: 'advanced',
		});

		if (!settings.allow_register) {
			return ctx.badRequest(
				null,
				formatError({
				id: 'Auth.advanced.allow_register',
				message: 'Register action is currently disabled.',
				})
			);
		}

		const params = {
			..._.omit(ctx.request.body, ['confirmed', 'confirmationToken', 'resetPasswordToken']),
			provider: 'local',
		};

		// Password is required.
		if (!params.password) {
			return ctx.badRequest(
				null,
				formatError({
				id: 'Auth.form.error.password.provide',
				message: 'Please provide your password.',
				})
			);
		}

		// Email is required.
		if (!params.email) {
			return ctx.badRequest(
				null,
				formatError({
				id: 'Auth.form.error.email.provide',
				message: 'Please provide your email.',
				})
			);
		}

		// Throw an error if the password selected by the user
		// contains more than three times the symbol '$'.
		if (strapi.plugins['users-permissions'].services.user.isHashed(params.password)) {
			return ctx.badRequest(
				null,
				formatError({
				id: 'Auth.form.error.password.format',
				message: 'Your password cannot contain more than three times the symbol `$`.',
				})
			);
		}

		let role;

		if (params.role) {
			role = await strapi
				.query('role', 'users-permissions')
				.findOne({ id: params.role }, []);
		} else {
			role = await strapi
			.query('role', 'users-permissions')
			.findOne({ type: settings.default_role }, []);
		}

		if (!role) {
			return ctx.badRequest(
				null,
				formatError({
					id: 'Auth.form.error.role.notFound',
					message: 'Impossible to find the default role.',
				})
			);
		}

		// Check if the provided email is valid or not.
		const isEmail = emailRegExp.test(params.email);

		if (isEmail) {
			params.email = params.email.toLowerCase();
		} else {
			return ctx.badRequest(
				null,
				formatError({
					id: 'Auth.form.error.email.format',
					message: 'Please provide valid email address.',
				})
			);
		}

		params.role = role.id;
		params.password = await strapi.plugins['users-permissions'].services.user.hashPassword(params);

		const existingUser = await strapi.query('user', 'users-permissions').findOne({
			email: params.email,
		});

		if (existingUser && existingUser.provider === params.provider && !params.invitation_code) {
			return ctx.badRequest(
				null,
					formatError({
					id: 'Auth.form.error.email.taken',
					message: 'Email is already taken.',
				})
			);
		}

		if (existingUser && existingUser.provider !== params.provider && settings.unique_email && !params.invitation_code) {
			return ctx.badRequest(
				null,
					formatError({
					id: 'Auth.form.error.email.taken',
					message: 'Email is already taken.',
				})
			);
		}

		try {
			if (!settings.email_confirmation) {
				params.confirmed = true;
			}

			let user;

			// if user already existed and is being invited then update user's company 
			if (existingUser && params.invitation_code) {
				user = await strapi.query('user', 'users-permissions').update({ id: existingUser.id }, { company: params.company, blocked: true });
			} else {
				user = await strapi.query('user', 'users-permissions').create({
					...params,
					blocked: !!params.invitation_code
				});
			}

			const sanitizedUser = sanitizeEntity(user, {
				model: strapi.query('user', 'users-permissions').model,
			});

			const jwt = strapi.plugins['users-permissions'].services.jwt.issue(_.pick(user, ['id']));

			// if user is new then add a new beta subscription
			// DELETE ONCE PRICING GOES LIVE
			if (!params.invitation_code) {
				const subscription = await strapi.services.subscription.create({ type: 'beta', active: true });

				await strapi.services.company.update({ id: user.company.id }, { subscription: subscription.id });
			}

			// email user
			let msg;
			if (params.invitation_code) {
				msg = {
					to: params.email,
					from: 'hello@clientbuddy.net',
					subject: `You have been invited to the ${user.company.name} workspace on Client Buddy`,
					html: `
						<div>Hi ${params.first_name}!</div>
						<br />
						<div>You have been invited to the ${user.company.name} workspace on Client Buddy.</div>
						<br />
						<div>Please set-up your password <a href="https://app.clientbuddy.net/auth/accept-invitation/${params.invitation_code}">here</a>.</div>
						<br />
						<div>Best Regards,</div>
						<br />
						<div>ClientBuddy</div>
					`,
				};
			} else {
				msg = {
					to: params.email,
					from: 'hello@clientbuddy.net',
					subject: 'Welcome to Client Buddy',
					html: `
						<div>Hi ${params.first_name}!</div>
						<br />
						<div>Thank you for choosing Client Buddy as your bug reporting tool. Please take a look at our <a href="https://clientbuddy.net/support/">documentation</a> and set-up your first site on Client Buddy.</div>
						<br />
						<div>If you have any questions, please don't hesitate to contact us by emailing support@clientbuddy.net.</div>
						<br />
						<div>Best Regards,</div>
						<br />
						<div>ClientBuddy</div>
					`,
				};
			}
			sgMail.send(msg);

			return ctx.send({
				jwt,
				user: sanitizedUser,
			});
		} catch (err) {
		const adminError = _.includes(err.message, 'username')
			? {
				id: 'Auth.form.error.username.taken',
				message: 'Username already taken',
			}
			: { id: 'Auth.form.error.email.taken', message: 'Email already taken' };

		ctx.badRequest(null, formatError(adminError));
		}
	},

	async emailConfirmation(ctx, next, returnUser) {
		const { confirmation: confirmationToken } = ctx.query;

		const { user: userService, jwt: jwtService } = strapi.plugins['users-permissions'].services;

		if (_.isEmpty(confirmationToken)) {
		return ctx.badRequest('token.invalid');
		}

		const user = await userService.fetch({ confirmationToken }, []);

		if (!user) {
		return ctx.badRequest('token.invalid');
		}

		await userService.edit({ id: user.id }, { confirmed: true, confirmationToken: null });

		if (returnUser) {
		ctx.send({
			jwt: jwtService.issue({ id: user.id }),
			user: sanitizeEntity(user, {
			model: strapi.query('user', 'users-permissions').model,
			}),
		});
		} else {
		const settings = await strapi
			.store({
			environment: '',
			type: 'plugin',
			name: 'users-permissions',
			key: 'advanced',
			})
			.get();

		ctx.redirect(settings.email_confirmation_redirection || '/');
		}
	},

	async sendEmailConfirmation(ctx) {
		const params = _.assign(ctx.request.body);

		if (!params.email) {
			return ctx.badRequest('missing.email');
		}

		const isEmail = emailRegExp.test(params.email);

		if (isEmail) {
		params.email = params.email.toLowerCase();
		} else {
		return ctx.badRequest('wrong.email');
		}

		const user = await strapi.query('user', 'users-permissions').findOne({
		email: params.email,
		});

		if (user.confirmed) {
		return ctx.badRequest('already.confirmed');
		}

		if (user.blocked) {
		return ctx.badRequest('blocked.user');
		}

		try {
		await strapi.plugins['users-permissions'].services.user.sendConfirmationEmail(user);
		ctx.send({
			email: user.email,
			sent: true,
		});
		} catch (err) {
		return ctx.badRequest(null, err);
		}
	},

	async acceptInvitation(ctx) {
		const params = _.assign(ctx.request.body);

		if (!params.invitationCode) {
			return ctx.badRequest('missing.invitation.code');
		}

		if (!params.password) {
			return ctx.badRequest('missing.password');
		}

		const user = await strapi.query('user', 'users-permissions').findOne({
			invitation_code: params.invitationCode,
		});

		if (!user) {
			return ctx.badRequest('wrong.invitation.code');
		}

		params.password = await strapi.plugins['users-permissions'].services.user.hashPassword(params);

		const unblockedUser = await strapi.query('user', 'users-permissions').update({ id: user.id }, { password: params.password, blocked: false });

		return sanitizeEntity(unblockedUser, { model: strapi.query('user', 'users-permissions').model });
	}
};