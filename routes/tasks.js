var Task = require('../models/task');
var User = require('../models/user');

module.exports = function (router) {

    var tasksRoute = router.route('/tasks');

    tasksRoute.get(function (req, res) {
        try {
            var query = Task.find();

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

            var limit = 100;
            if (req.query.limit) {
                limit = parseInt(req.query.limit);
                if (isNaN(limit)) {
                    return res.status(400).json({
                        message: "Invalid limit parameter. Must be a number.",
                        data: {}
                    });
                }
            }
            query = query.limit(limit);

            if (req.query.count === 'true') {
                query.countDocuments().exec(function (err, count) {
                    if (err) {
                        return res.status(500).json({
                            message: "Error counting tasks.",
                            data: {}
                        });
                    }
                    return res.status(200).json({
                        message: "OK",
                        data: count
                    });
                });
            } else {
                query.exec(function (err, tasks) {
                    if (err) {
                        return res.status(500).json({
                            message: "Error retrieving tasks.",
                            data: {}
                        });
                    }
                    return res.status(200).json({
                        message: "OK",
                        data: tasks
                    });
                });
            }
        } catch (err) {
            return res.status(500).json({
                message: "Internal server error.",
                data: {}
            });
        }
    });

    tasksRoute.post(function (req, res) {
        if (!req.body.name) {
            return res.status(400).json({
                message: "Task name is required.",
                data: {}
            });
        }
        if (!req.body.deadline) {
            return res.status(400).json({
                message: "Task deadline is required.",
                data: {}
            });
        }

        var task = new Task();
        task.name = req.body.name;
        task.description = req.body.description || "";
        task.deadline = req.body.deadline;
        task.completed = req.body.completed !== undefined ? req.body.completed : false;
        task.assignedUser = req.body.assignedUser || "";
        task.assignedUserName = req.body.assignedUserName || "unassigned";

        task.save(function (err, savedTask) {
            if (err) {
                return res.status(500).json({
                    message: "Error creating task.",
                    data: {}
                });
            }
            return res.status(201).json({
                message: "Task created successfully.",
                data: savedTask
            });
        });
    });

    var taskRoute = router.route('/tasks/:id');

    taskRoute.get(function (req, res) {
        var query = Task.findById(req.params.id);

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

        query.exec(function (err, task) {
            if (err) {
                return res.status(500).json({
                    message: "Error retrieving task.",
                    data: {}
                });
            }
            if (!task) {
                return res.status(404).json({
                    message: "Task not found.",
                    data: {}
                });
            }
            return res.status(200).json({
                message: "OK",
                data: task
            });
        });
    });

    taskRoute.put(function (req, res) {
        if (!req.body.name) {
            return res.status(400).json({
                message: "Task name is required.",
                data: {}
            });
        }
        if (!req.body.deadline) {
            return res.status(400).json({
                message: "Task deadline is required.",
                data: {}
            });
        }

        Task.findById(req.params.id, function (err, task) {
            if (err) {
                return res.status(500).json({
                    message: "Error finding task.",
                    data: {}
                });
            }
            if (!task) {
                return res.status(404).json({
                    message: "Task not found.",
                    data: {}
                });
            }

            var oldAssignedUser = task.assignedUser;
            var newAssignedUser = req.body.assignedUser || "";
            var newCompleted = req.body.completed !== undefined ? req.body.completed : false;

            if (task.completed && oldAssignedUser !== newAssignedUser) {
                return res.status(400).json({
                    message: "Cannot reassign a completed task.",
                    data: {}
                });
            }
            task.name = req.body.name;
            task.description = req.body.description || "";
            task.deadline = req.body.deadline;
            task.completed = newCompleted;
            task.assignedUser = newAssignedUser;
            task.assignedUserName = req.body.assignedUserName || "unassigned";

            task.save(function (err, updatedTask) {
                if (err) {
                    return res.status(500).json({
                        message: "Error updating task.",
                        data: {}
                    });
                }

                if (oldAssignedUser && oldAssignedUser !== "" && oldAssignedUser !== newAssignedUser) {
                    User.findById(oldAssignedUser, function (err, user) {
                        if (!err && user) {
                            user.pendingTasks = user.pendingTasks.filter(function(taskId) {
                                return taskId !== req.params.id;
                            });
                            user.save();
                        }
                    });
                }

                if (newAssignedUser && newAssignedUser !== "" && !newCompleted) {
                    User.findById(newAssignedUser, function (err, user) {
                        if (!err && user) {
                            if (user.pendingTasks.indexOf(req.params.id) === -1) {
                                user.pendingTasks.push(req.params.id);
                                user.save();
                            }
                        }
                    });
                } else if (newCompleted && newAssignedUser && newAssignedUser !== "") {
                    User.findById(newAssignedUser, function (err, user) {
                        if (!err && user) {
                            user.pendingTasks = user.pendingTasks.filter(function(taskId) {
                                return taskId !== req.params.id;
                            });
                            user.save();
                        }
                    });
                }

                return res.status(200).json({
                    message: "Task updated successfully.",
                    data: updatedTask
                });
            });
        });
    });

    taskRoute.delete(function (req, res) {
        Task.findByIdAndDelete(req.params.id, function (err, task) {
            if (err) {
                return res.status(500).json({
                    message: "Error deleting task.",
                    data: {}
                });
            }
            if (!task) {
                return res.status(404).json({
                    message: "Task not found.",
                    data: {}
                });
            }

            if (task.assignedUser && task.assignedUser !== "") {
                User.findById(task.assignedUser, function (err, user) {
                    if (!err && user) {
                        user.pendingTasks = user.pendingTasks.filter(function(taskId) {
                            return taskId !== req.params.id;
                        });
                        user.save();
                    }
                });
            }

            return res.status(204).send(); //post @292 says The code 204 should be used when the request is successful but has no response body.
        });
    });

    return router;
};


