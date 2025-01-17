const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const gravatar = require('gravatar');
const path = require("path");
const fs = require("fs/promises");
const Jimp = require("jimp");
const { v4: uuidv4 } = require('uuid');
const { User } = require('../db/userModel');
const { RegistrationConflictError, NotAuthorizedError, NotFoundError, Nodejs55Error } = require('../helpers/errors');
const { sendEmail } = require('../helpers/sendEmail');
require('dotenv').config();

const { BASE_URL } = process.env;

const signup = async (email, password, subscription, avatarURL) => {
    const user = await User.findOne({ email });
    
    if (user) {
        throw new RegistrationConflictError("Email in use");
    };

    const verificationToken = uuidv4(5);

    const newUser = await User.create({
        email,
        password,
        subscription,
        avatarURL: gravatar.url(email),
        verificationToken,
    });
    
    sendEmail({
        to: email,
        subject: 'Mail confirmation',
        html: `Please, confirm your email by clicking on <a target="_blank" href="${BASE_URL}/api/auth/users/verify/${verificationToken}">this link</a>`,
    });
    
    return newUser;
};

const verifyEmail = async (verificationToken) => {
    const user = await User.findOneAndUpdate(
        { verificationToken },
        { verificationToken: null, verify: true }
    );
    
    if (!user) {
        throw new NotFoundError('User not found');
    };

    await sendEmail({
        to: user.email,
        subject: 'Thank you for verification your email!',
        html: `<p>Verification was successful!</p>`,
    });
};

const resendEmail = async (email) => {
    const user = await User.findOne({ email, verify: false });
    
    if (!user) {
        throw new Nodejs55Error('Verification has already been passed');
    };

    await sendEmail({
        to: user.email,
        subject: 'Mail confirmation',
        html: `Please, confirm your email by clicking on <a target="_blank" href="${BASE_URL}/api/auth/users/verify/${user.verificationToken}">this link</a>`,
    });
};

const login = async (email, password, subscription) => {
    const user = await User.findOne({ email, verify: true });

    if (!user || !await bcrypt.compare(password, user.password)) {
        throw new NotAuthorizedError("Email or password is wrong or email is not verify");
    }

    const payload = {
        _id: user._id,
        email: user.email,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
    await User.findByIdAndUpdate(user._id, { token });
    user.token = token;
     
    const data = { token: token, user: user };
    return data;
};

const logout = async (_id ) => {
    await User.findByIdAndUpdate(_id, { token: null });
};

const updateSubscription = async (_id, subscription ) => {
    const user = await User.findByIdAndUpdate(_id, { subscription });
    user.subscription = subscription;
    return user;
};

const updateAvatar = async (_id, temporaryName, originalname) => {
    console.log("temporaryName", temporaryName);
    const avatarsDir = path.resolve('./public/avatars');
    const [, extension] = originalname.split('.');
    const avatarName = `${_id}.${extension}`;

    try {
        // resize
        const avatar = await Jimp.read(temporaryName);
        avatar.resize(250, 250);
        // move to public/avatars
        const avatarPath = path.join(avatarsDir, avatarName);
        console.log("avatarPath", avatarPath);
        await fs.rename(temporaryName, avatarPath); // move to different directory
        // save path to db
        const avatarURL = path.join("avatars", avatarName);
        await User.findByIdAndUpdate(_id, { avatarURL });
        return avatarURL;
    } catch (err) {
        await fs.unlink(temporaryName); // remove
        throw new Error(err.message);
    }
};

module.exports = {
    signup,
    verifyEmail,
    resendEmail,
    login,
    logout,
    updateSubscription,
    updateAvatar,
};