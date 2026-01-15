module.exports = {
  generateRandomPhone,
  generateRandomEmail,
  generateComplaintData,
};

function generateRandomPhone(context, events, done) {
  context.vars.phone = `+963${Math.floor(Math.random() * 900000000 + 100000000)}`;
  return done();
}

function generateRandomEmail(context, events, done) {
  const random = Math.random().toString(36).substring(7);
  context.vars.email = `user_${random}@test.com`;
  return done();
}

function generateComplaintData(context, events, done) {
  const types = ['كهرباء', 'مياه', 'نظافة', 'طرقات', 'صحة'];
  const locations = ['دمشق', 'حلب', 'حمص', 'اللاذقية'];

  context.vars.complaintType = types[Math.floor(Math.random() * types.length)];
  context.vars.complaintLocation =
    locations[Math.floor(Math.random() * locations.length)];

  return done();
}
