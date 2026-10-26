import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () =>
	json({
		status: 'ok',
		service: 'owltside-admin',
		region: 'us-west-lagos-01',
		time: new Date().toISOString()
	});
