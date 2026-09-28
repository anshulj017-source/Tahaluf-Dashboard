import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const authCode = searchParams.get('auth_code');
  const state = searchParams.get('state');

  console.log('TikTok Marketing API Callback Received:');
  console.log('Auth Code:', authCode);
  console.log('State:', state);

  if (!authCode) {
    return NextResponse.json(
      { error: 'Missing auth_code parameter' },
      { status: 400 }
    );
  }

  const appId = process.env.TIKTOK_APP_ID;
  const secret = process.env.TIKTOK_APP_SECRET;

  if (!appId || !secret) {
    return NextResponse.json(
      { error: 'Missing TikTok App credentials in environment variables.' },
      { status: 500 }
    );
  }

  try {
    const tokenResponse = await fetch('https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_id: appId,
        secret: secret,
        auth_code: authCode,
      }),
    });

    const data = await tokenResponse.json();

    if (data.code !== 0) {
      console.error('TikTok API Error:', data.message);
      return NextResponse.json({ error: data.message }, { status: 400 });
    }

    const { access_token, advertiser_ids } = data.data;

    // TODO: In a production environment, save `access_token` and `advertiser_ids` to your database
    // securely associated with the user's session, rather than returning it in the response.

    return NextResponse.json({
      message: 'OAuth successful',
      access_token,
      advertiser_ids,
      instructions: 'Please save this access_token and use it for future API requests.'
    });

  } catch (error) {
    console.error('Error exchanging token:', error);
    return NextResponse.json(
      { error: 'Internal Server Error while exchanging token' },
      { status: 500 }
    );
  }
}
