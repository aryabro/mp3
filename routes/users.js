var User = require('../models/user');
var Task = require('../models/task');

module.exports = function (router) {

    var usersRoute = router.route('/users');

    usersRoute.get(function (req, res) {
        try {
            var query = User.find();

            if (req.query.where) {
                try {
                    var whereConditions = JSON.parse(req.query.where);
                    query = query.where(whereConditions);
                } catch (e) {
                    return res.status(400).json({
                        message: "Invalid where parameter. Must be valid JSON.",
                        data: {}
                    });
                }
            }

            if (req.query.sort) {
                try {
                    var sortConditions = JSON.parse(req.query.sort);
                    query = query.sort(sortConditions);
                } catch (e) {
                    return res.status(400).json({
                        message: "Invalid sort parameter. Must be valid JSON.",
                        data: {}
                    });
                }
            }

            if (req.query.select) {
                try {
                    var selectFields = JSON.parse(req.query.select);
                    query = query.select(selectFields);
                } catch (e) {
                    return res.status(400).json({
                        message: "Invalid select parameter. Must be valid JSON.",
                        data: {}
                    });
                }
            }

            if (req.query.skip) {
                var skip = parseInt(req.query.skip);
                if (isNaN(skip)) {
                    return res.status(400).json({
                        message: "Invalid skip parameter. Must be a number.",
                        data: {}
                    });
                }
                query = query.skip(skip);
            }

            if (req.query.limit) {
                var limit = parseInt(req.query.limit);
                if (isNaN(limit)) {
                    return res.status(400).json({
                        message: "Invalid limit parameter. Must be a number.",
                        data: {}
                    });
                }
                query = query.limit(limit);
            }

            if (req.query.count === 'true') {
                query.countDocuments().exec(function (err, count) {
                    if (err) {
                        return res.status(500).json({
                            message: "Error counting users.",
                            data: {}
                        });
                    }
                    return res.status(200).json({
                        message: "OK",
                        data: count
                    });
                });
            } else {
                query.exec(function (err, users) {
                    if (err) {
                        return res.status(500).json({
                            message: "Error retrieving users.",
                            data: {}
                        });
                    }
                    return res.status(200).json({
                        message: "OK",
                        data: users
                    });
                });
            }
        } catch (err) {
            return res.status(500).json({
                message: "Unexpected error occurred.",
                data: {}
            });
        }
    });

    // POST
    usersRoute.post(function (req, res) {

        if (!req.body.name) {
            return res.status(400).json({
                message: "User name is required.",
                data: {}
            });
        }
        if (!req.body.email) {
            return res.status(400).json({
                message: "User email is required.",
                data: {}
            });
        }

        var user = new User();
        user.name = req.body.name;
        user.email = req.body.email;
        user.pendingTasks = []; //post @285 says not expecting any pending tasks while creating a user

        user.save(function (err, savedUser) {
            if (err) {
                if (err.code === 11000) {
                    return res.status(400).json({
                        message: "An user with this email already exists.",
                        data: {}
                    });
                }
                return res.status(500).json({
                    message: "Error creating user.",
                    data: {}
                });
            }
            return res.status(201).json({
                message: "User created successfully.",
                data: savedUser
            });
        });
    });

    var userRoute = router.route('/users/:id');

    userRoute.get(function (req, res) {
        var query = User.findById(req.params.id);


        if (req.query.select) {
            try {
                var selectFields = JSON.parse(req.query.select);
                query = query.select(selectFields);
            } catch (e) {
                return res.status(400).json({
                    message: "Invalid select parameter. Must be valid JSON.",
                    data: {}
                });
            }
        }

        query.exec(function (err, user) {
            if (err) {
                return res.status(500).json({
                    message: "Error retrieving user.",
                    data: {}
                });
            }
            if (!user) {
                return res.status(404).json({
                    message: "User not found.",
                    data: {}
                });
            }
            return res.status(200).json({
                message: "OK",
                data: user
            });
        });
    });

    // PUT
    userRoute.put(function (req, res) {
        if (!req.body.name) {
            return res.status(400).json({
                message: "User name is required.",
                data: {}
            });
        }
        if (!req.body.email) {
            return res.status(400).json({
                message: "User email is required.",
                data: {}
            });
        }

        User.findById(req.params.id, function (err, user) {
            if (err) {
                return res.status(500).json({
                    message: "Error finding user.",
                    data: {}
                });
            }
            if (!user) {
                return res.status(404).json({
                    message: "User not found.",
                    data: {}
                });
            }

            var oldPendingTasks = user.pendingTasks || [];
            var newPendingTasks = req.body.pendingTasks || [];

            if (newPendingTasks.length > 0) {
                Task.find({ _id: { $in: newPendingTasks }, completed: true }, function (err, completedTasks) {
                    if (err) {
                        return res.status(500).json({
                            message: "Error checking tasks.",
                            data: {}
                        });
                    }
                    if (completedTasks && completedTasks.length > 0) {
                        return res.status(400).json({
                            message: "Cannot add completed tasks to pending tasks.",
                            data: {}
                        });
                    }

                    updateUserAndTasks();
                });
            } else {
                updateUserAndTasks();
            }

            function updateUserAndTasks() {
                user.name = req.body.name;
                user.email = req.body.email;
                user.pendingTasks = newPendingTasks;

                user.save(function (err, updatedUser) {
                if (err) {
                    if (err.code === 11000) {
                        return res.status(400).json({
                            message: "A user with this email already exists.",
                            data: {}
                        });
                    }
                    return res.status(500).json({
                        message: "Error updating user.",
                        data: {}
                    });
                }

                //@325 said  remove same tasks from other users when reassigning to this user. IMP for hidden prob
                if (newPendingTasks.length > 0) {
                    User.updateMany(
                        { _id: { $ne: user._id }, pendingTasks: { $in: newPendingTasks }},
                        { $pull: { pendingTasks: { $in: newPendingTasks }}},
                    );
                }
                // Update new pending tasks to reference this user main thing IMP
                Task.updateMany(
                    { _id: { $in: newPendingTasks } },
                    { $set: { assignedUser: user._id.toString(), assignedUserName: user.name } },
                );

                // Unassign tasks that are no longer in pendingTasks. main thing IMP
                var removedTasks = oldPendingTasks.filter(function(taskId) {
                    return newPendingTasks.indexOf(taskId) === -1;
                });
                
                if (removedTasks.length > 0) {
                    Task.updateMany(
                        { _id: { $in: removedTasks } },
                        { $set: { assignedUser: "", assignedUserName: "unassigned" } },
                    );
                }

                return res.status(200).json({
                    message: "User updated successfully.",
                    data: updatedUser
                });
            });
            }
        });
    });

    // DELETE
    userRoute.delete(function (req, res) {
        User.findByIdAndDelete(req.params.id, function (err, user) {
            if (err) {
                return res.status(500).json({
                    message: "Error deleting user.",
                    data: {}
                });
            }
            if (!user) {
                return res.status(404).json({
                    message: "User not found.",
                    data: {}
                });
            }

            // Unassign all tasks that were assigned to this user. main thing IMP
            Task.updateMany(
                { assignedUser: req.params.id },
                { $set: { assignedUser: "", assignedUserName: "unassigned" } }
            );

            return res.status(204).send(); //post @292 says The code 204 should be used when the request is successful but has no response body.
        });
    });

    return router;
};


