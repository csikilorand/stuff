exports.onExecutePostLogin = async (event, api) => {
  const axios = require('axios');

  const namespace = 'https://YOUR_NAMESPACE/'; // Replace with your namespace
  const ManagementClient = require('auth0').ManagementClient;
  const auth0 = new ManagementClient({
    domain: event.secrets.DOMAIN,
    clientId: event.secrets.CLIENT_ID,
    clientSecret: event.secrets.CLIENT_SECRET,
    scope: 'read:users update:users'
  });

  if (!event.user.email_verified) {
    // If the user's email is not verified, don't proceed with account linking
    return;
  }

  // Find other users with the same email
  const users = await auth0.getUsersByEmail(event.user.email);
  const otherUsers = users.filter(u => u.user_id !== event.user.user_id && u.email_verified);

  if (otherUsers.length > 1) {
    // If there are multiple other users with the same verified email, log an error
    console.log('Multiple user profiles already exist - cannot select a single profile to link to.');
    return;
  } else if (otherUsers.length === 0) {
    // If there are no other verified users with the same email, nothing needs to be done
    console.log('No other users found with the same email address.');
    return;
  }

  // Prepare for linking accounts
  const primaryUser = otherUsers[0];
  const provider = event.user.identities[0].provider;
  const providerUserId = event.user.identities[0].user_id;
  
  // Merge user_metadata and app_metadata from both accounts
  const combinedUserMetadata = { ...primaryUser.user_metadata, ...event.user.user_metadata };
  const combinedAppMetadata = { ...primaryUser.app_metadata, ...event.user.app_metadata };
  
  // Update the primary user's metadata to include data from the currently logging in user
  await auth0.updateUserMetadata(primaryUser.user_id, combinedUserMetadata);
  await auth0.updateAppMetadata(primaryUser.user_id, combinedAppMetadata);

  // Link the accounts
  await axios.post(`https://${event.secrets.DOMAIN}/api/v2/users/${primaryUser.user_id}/identities`, {
    provider: provider,
    user_id: String(providerUserId)
  }, {
    headers: {
      Authorization: `Bearer ${event.secrets.MANAGEMENT_API_ACCESS_TOKEN}`
    }
  }).then(response => {
    api.idToken.setCustomClaim(`${namespace}primary_user`, primaryUser.user_id);
  }).catch(error => {
    console.log('Error linking account: ', error.response.statusMessage);
  });
};
